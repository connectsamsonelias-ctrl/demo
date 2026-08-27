import { query } from "@/lib/db/pool";
import { z } from "@/lib/validation";
import { assertOwnsContentItem } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import { DEFAULT_CREATOR_SHARE_PERCENT, DEFAULT_PLATFORM_SHARE_PERCENT } from "@/lib/licensing/commission";
import type { Session } from "@/lib/auth/session";
import type { LicensingTermsRow } from "@/lib/db/types";

/**
 * Screen C05 ("opt-in to licensing with explicit terms"). This is a
 * full-replace schema, not a partial patch, mirroring what the row
 * represents: the creator's *current* stated terms, wholesale replaced by
 * their latest decision — not something to be built up field-by-field.
 * `creator_share_percent`/`platform_share_percent` are deliberately absent
 * from this schema: they are never client-settable (spec security rule),
 * set only from lib/licensing/commission.ts's platform default.
 */
export const licensingTermsSchema = z.object({
  allowedUseTypes: z.array(z.string().trim().min(1).max(100)).max(20).optional(),
  licenseDuration: z.string().trim().max(200).optional(),
  geographicScope: z.string().trim().max(200).optional(),
  // Free text in the schema (migration 007's commercial_status is TEXT, not
  // an enum), but constrained to two values here as an engineering default
  // — the spec doesn't enumerate allowed values beyond the commercial/
  // non-commercial distinction it implies.
  commercialStatus: z.enum(["non_commercial", "commercial"]).optional(),
  pricingModel: z.string().trim().max(100).optional(),
  basePrice: z.number().nonnegative().max(1_000_000).optional(),
});
export type LicensingTermsInput = z.infer<typeof licensingTermsSchema>;

export async function setLicensingTerms(
  session: Session,
  contentItemId: string,
  input: LicensingTermsInput
): Promise<LicensingTermsRow> {
  await assertOwnsContentItem(session, contentItemId);

  const existing = await query<LicensingTermsRow>(
    "SELECT * FROM licensing_terms WHERE content_item_id = $1",
    [contentItemId]
  );

  const rows = existing[0]
    ? await query<LicensingTermsRow>(
        `UPDATE licensing_terms
         SET allowed_use_types = $2::jsonb, license_duration = $3, geographic_scope = $4,
             commercial_status = $5, pricing_model = $6, base_price = $7
         WHERE content_item_id = $1
         RETURNING *`,
        [
          contentItemId,
          JSON.stringify(input.allowedUseTypes ?? []),
          input.licenseDuration ?? null,
          input.geographicScope ?? null,
          input.commercialStatus ?? "non_commercial",
          input.pricingModel ?? null,
          input.basePrice ?? null,
        ]
      )
    : await query<LicensingTermsRow>(
        `INSERT INTO licensing_terms
           (content_item_id, allowed_use_types, license_duration, geographic_scope,
            commercial_status, pricing_model, base_price, creator_share_percent, platform_share_percent)
         VALUES ($1, $2::jsonb, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          contentItemId,
          JSON.stringify(input.allowedUseTypes ?? []),
          input.licenseDuration ?? null,
          input.geographicScope ?? null,
          input.commercialStatus ?? "non_commercial",
          input.pricingModel ?? null,
          input.basePrice ?? null,
          DEFAULT_CREATOR_SHARE_PERCENT,
          DEFAULT_PLATFORM_SHARE_PERCENT,
        ]
      );

  const terms = rows[0]!;
  await recordAuditLog({
    actorId: session.userId,
    action: existing[0] ? "licensing_terms.update" : "licensing_terms.create",
    entityType: "licensing_terms",
    entityId: terms.id,
    oldState: existing[0] ?? undefined,
    newState: terms,
    metadata: { content_item_id: contentItemId },
  });
  return terms;
}

export async function getLicensingTermsForCreator(
  session: Session,
  contentItemId: string
): Promise<LicensingTermsRow | null> {
  await assertOwnsContentItem(session, contentItemId);
  const rows = await query<LicensingTermsRow>(
    "SELECT * FROM licensing_terms WHERE content_item_id = $1",
    [contentItemId]
  );
  return rows[0] ?? null;
}
