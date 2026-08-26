import { query } from "@/lib/db/pool";

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

export async function listMarketplaceItems(): Promise<MarketplaceListing[]> {
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
       SELECT summary, quality_score
       FROM knowledge_assets
       WHERE content_item_id = ci.id AND asset_type = 'knowledge_audit'
       ORDER BY created_at DESC
       LIMIT 1
     ) ka ON true
     WHERE ci.rights_status = 'LISTED'
     ORDER BY ci.created_at DESC
     LIMIT $1`,
    [LIMIT]
  );
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
  };
}
