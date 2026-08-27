import { withTransaction, query } from "@/lib/db/pool";
import { z } from "@/lib/validation";
import type { BuyerProfileRow } from "@/lib/db/types";

/**
 * Mirrors lib/creator/profile.ts's pattern exactly (Milestone 5), for a
 * gap in the spec's own API list: Section 9 lists GET/PATCH
 * /api/creator/profile but has no buyer equivalent, even though
 * buyer_profiles has existed since Milestone 2 and Screen B02 requires
 * these fields. verification_status is deliberately NOT a field here —
 * admin-controlled only (see lib/admin/verification.ts, Milestone 18),
 * silently dropped by zod rather than merely rejected if a client sends
 * it.
 */
export const buyerProfileSchema = z.object({
  organizationName: z.string().trim().min(1).max(200),
  organizationType: z.string().trim().min(1).max(100),
  industry: z.string().trim().max(100).optional(),
  useCase: z.string().trim().max(2000).optional(),
});
export type BuyerProfileInput = z.infer<typeof buyerProfileSchema>;

export async function getBuyerProfile(userId: string): Promise<BuyerProfileRow | null> {
  const rows = await query<BuyerProfileRow>("SELECT * FROM buyer_profiles WHERE user_id = $1", [userId]);
  return rows[0] ?? null;
}

/**
 * Create-or-update, matching creatorProfile's PATCH-only pattern (the
 * spec's Creator API list has no separate POST for profile creation
 * either). Two explicit code paths rather than ON CONFLICT — same
 * reasoning as lib/creator/profile.ts: a NOT NULL column with no
 * fallback default (organization_type here) needs a real value on
 * insert but must be able to survive being omitted on update.
 */
export async function upsertBuyerProfile(userId: string, input: BuyerProfileInput): Promise<BuyerProfileRow> {
  return withTransaction(async (client) => {
    const existing = await client.query<BuyerProfileRow>(
      "SELECT * FROM buyer_profiles WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const current = existing.rows[0];

    if (!current) {
      const inserted = await client.query<BuyerProfileRow>(
        `INSERT INTO buyer_profiles (user_id, organization_name, organization_type, industry, use_case)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, input.organizationName, input.organizationType, input.industry ?? null, input.useCase ?? null]
      );
      return inserted.rows[0]!;
    }

    const updated = await client.query<BuyerProfileRow>(
      `UPDATE buyer_profiles
       SET organization_name = $2, organization_type = $3, industry = $4, use_case = $5
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        input.organizationName,
        input.organizationType,
        input.industry !== undefined ? input.industry : current.industry,
        input.useCase !== undefined ? input.useCase : current.use_case,
      ]
    );
    return updated.rows[0]!;
  });
}
