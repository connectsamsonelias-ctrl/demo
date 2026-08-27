import { query } from "@/lib/db/pool";
import { z } from "@/lib/validation";

/**
 * Public, unauthenticated reads — no Session, no ownership check (there
 * is no owner-of-the-request concept here, anyone can browse). Every
 * query below is intentionally an explicit column list, never
 * `SELECT *`: content_items carries internal-only fields (the
 * ownership_attestation_text/_at compliance record, the admin
 * moderation `status`) that must never leak to a public response, and
 * creator_profiles carries the creator's user_id — only display_name/
 * bio are public-safe.
 */

export interface MarketplaceListing {
  id: string;
  title: string;
  description: string | null;
  category: string;
  language: string;
  creatorDisplayName: string;
  qualitySummary: string | null;
  qualityScore: string | null;
  createdAt: string;
}

const LIMIT = 50;

/**
 * Milestone 10 filters, matching the spec's P03 filter list against what
 * data actually exists: full-text query (title+description), category,
 * language, topic/skill (from the audit's knowledge_assets.topics/
 * skills), and a minimum quality score. Deliberately NOT implemented:
 * "Industry" (no distinct column — category already serves this role)
 * and "Rights type"/"License availability" (both depend on
 * licensing_terms data that Milestone 14 hasn't populated yet —
 * fabricating filters over nonexistent data would be worse than
 * omitting them).
 */
export const marketplaceFiltersSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  language: z.string().trim().min(1).max(50).optional(),
  topic: z.string().trim().min(1).max(100).optional(),
  skill: z.string().trim().min(1).max(100).optional(),
  minQuality: z.coerce.number().int().min(0).max(100).optional(),
});
export type MarketplaceFilters = z.infer<typeof marketplaceFiltersSchema>;

/**
 * Builds the WHERE clause and its parameters together, in lockstep, so a
 * condition and its placeholder number can never drift apart. Every
 * value is bound as a query parameter — never string-interpolated —
 * regardless of how many filters are active.
 */
function buildFilterConditions(filters: MarketplaceFilters, startParamIndex: number) {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let i = startParamIndex;

  if (filters.q) {
    conditions.push(
      `to_tsvector('english', coalesce(ci.title, '') || ' ' || coalesce(ci.description, '')) @@ plainto_tsquery('english', $${i})`
    );
    params.push(filters.q);
    i++;
  }
  if (filters.category) {
    conditions.push(`ci.category = $${i}`);
    params.push(filters.category);
    i++;
  }
  if (filters.language) {
    conditions.push(`ci.language = $${i}`);
    params.push(filters.language);
    i++;
  }
  if (filters.topic) {
    conditions.push(`ka.topics @> $${i}::jsonb`);
    params.push(JSON.stringify([filters.topic]));
    i++;
  }
  if (filters.skill) {
    conditions.push(`ka.skills @> $${i}::jsonb`);
    params.push(JSON.stringify([filters.skill]));
    i++;
  }
  if (filters.minQuality !== undefined) {
    conditions.push(`ka.quality_score >= $${i}`);
    params.push(filters.minQuality);
    i++;
  }
  return { conditions, params, nextParamIndex: i };
}

export async function listMarketplaceItems(filters: MarketplaceFilters = {}): Promise<MarketplaceListing[]> {
  const { conditions, params, nextParamIndex } = buildFilterConditions(filters, 1);
  const whereClause = conditions.length > 0 ? `AND ${conditions.join(" AND ")}` : "";

  return query<MarketplaceListing>(
    `SELECT
       ci.id,
       ci.title,
       ci.description,
       ci.category,
       ci.language,
       cp.display_name AS "creatorDisplayName",
       ka.summary AS "qualitySummary",
       ka.quality_score AS "qualityScore",
       ci.created_at AS "createdAt"
     FROM content_items ci
     JOIN creator_profiles cp ON cp.id = ci.creator_id
     LEFT JOIN LATERAL (
       SELECT summary, quality_score, topics, skills
       FROM knowledge_assets
       WHERE content_item_id = ci.id AND asset_type = 'knowledge_audit'
       ORDER BY created_at DESC
       LIMIT 1
     ) ka ON true
     WHERE ci.rights_status = 'LISTED' ${whereClause}
     ORDER BY ci.created_at DESC
     LIMIT $${nextParamIndex}`,
    [...params, LIMIT]
  );
}

/**
 * Public-safe subset of licensing_terms — deliberately excludes
 * creator_share_percent/platform_share_percent (the commission split is
 * an internal detail between the platform and the creator, never shown
 * to a buyer) and id/content_item_id/timestamps (not useful here).
 */
export interface PublicLicensingTerms {
  allowedUseTypes: unknown[];
  licenseDuration: string | null;
  geographicScope: string | null;
  commercialStatus: string;
  pricingModel: string | null;
  basePrice: string | null;
}

export interface MarketplaceListingDetail extends MarketplaceListing {
  rightsStatus: string;
  sourcePlatform: string;
  topics: unknown[];
  skills: unknown[];
  entities: unknown[];
  potentialUseCases: unknown[];
  /** Honest about what the audit actually analyzed — see Milestone 7's Tier-1/metadata-only scope note. */
  provenanceBasis: string | null;
  /** null when the creator hasn't set licensing terms yet (Milestone 14) — a real, distinct state from "free"/"contact us", shown as such. */
  licensingTerms: PublicLicensingTerms | null;
}

/** Returns null for both "no such content item" and "exists but not listed" — a public caller can't distinguish the two, same enumeration-avoidance reasoning used throughout this project. */
export async function getMarketplaceItem(contentItemId: string): Promise<MarketplaceListingDetail | null> {
  const rows = await query<
    MarketplaceListing & {
      rightsStatus: string;
      sourcePlatform: string;
      topics: unknown[] | null;
      skills: unknown[] | null;
      entities: unknown[] | null;
      structuredContent: { potentialUseCases?: unknown[] } | null;
      provenance: { input_basis?: string } | null;
      allowedUseTypes: unknown[] | null;
      licenseDuration: string | null;
      geographicScope: string | null;
      commercialStatus: string | null;
      pricingModel: string | null;
      basePrice: string | null;
    }
  >(
    `SELECT
       ci.id,
       ci.title,
       ci.description,
       ci.category,
       ci.language,
       ci.rights_status AS "rightsStatus",
       ci.source_platform AS "sourcePlatform",
       cp.display_name AS "creatorDisplayName",
       ka.summary AS "qualitySummary",
       ka.quality_score AS "qualityScore",
       ka.topics AS "topics",
       ka.skills AS "skills",
       ka.entities AS "entities",
       ka.structured_content AS "structuredContent",
       ka.provenance AS "provenance",
       lt.allowed_use_types AS "allowedUseTypes",
       lt.license_duration AS "licenseDuration",
       lt.geographic_scope AS "geographicScope",
       lt.commercial_status AS "commercialStatus",
       lt.pricing_model AS "pricingModel",
       lt.base_price AS "basePrice",
       ci.created_at AS "createdAt"
     FROM content_items ci
     JOIN creator_profiles cp ON cp.id = ci.creator_id
     LEFT JOIN LATERAL (
       SELECT summary, quality_score, topics, skills, entities, structured_content, provenance
       FROM knowledge_assets
       WHERE content_item_id = ci.id AND asset_type = 'knowledge_audit'
       ORDER BY created_at DESC
       LIMIT 1
     ) ka ON true
     LEFT JOIN licensing_terms lt ON lt.content_item_id = ci.id
     WHERE ci.id = $1 AND ci.rights_status = 'LISTED'`,
    [contentItemId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    language: row.language,
    rightsStatus: row.rightsStatus,
    sourcePlatform: row.sourcePlatform,
    creatorDisplayName: row.creatorDisplayName,
    provenanceBasis: row.provenance?.input_basis ?? null,
    qualitySummary: row.qualitySummary,
    qualityScore: row.qualityScore,
    topics: row.topics ?? [],
    skills: row.skills ?? [],
    entities: row.entities ?? [],
    potentialUseCases: row.structuredContent?.potentialUseCases ?? [],
    createdAt: row.createdAt,
    licensingTerms: row.commercialStatus
      ? {
          allowedUseTypes: row.allowedUseTypes ?? [],
          licenseDuration: row.licenseDuration,
          geographicScope: row.geographicScope,
          commercialStatus: row.commercialStatus,
          pricingModel: row.pricingModel,
          basePrice: row.basePrice,
        }
      : null,
  };
}
