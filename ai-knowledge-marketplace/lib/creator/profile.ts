import { withTransaction, query } from "@/lib/db/pool";
import { z } from "@/lib/validation";
import type { CreatorProfileRow } from "@/lib/db/types";

/**
 * verification_status is deliberately NOT a field on this schema — it is
 * admin-controlled only (see lib/admin/verification.ts, Milestone 18). A
 * client-supplied value in the request body is silently ignored, not
 * just rejected, because this schema never reads it.
 */
export const creatorProfileSchema = z.object({
  displayName: z.string().trim().min(1).max(200),
  bio: z.string().trim().max(2000).optional(),
  expertise: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  languages: z.array(z.string().trim().min(1).max(50)).max(50).optional(),
  links: z.array(z.string().trim().url()).max(20).optional(),
});

export type CreatorProfileInput = z.infer<typeof creatorProfileSchema>;

export async function getCreatorProfile(userId: string): Promise<CreatorProfileRow | null> {
  const rows = await query<CreatorProfileRow>("SELECT * FROM creator_profiles WHERE user_id = $1", [
    userId,
  ]);
  return rows[0] ?? null;
}

/**
 * Create-or-update, matching the spec's single `PATCH /api/creator/profile`
 * endpoint (no separate POST). `displayName` is always required by the
 * caller's validation, on both the first call and later edits — kept
 * deliberately simple rather than making it conditionally-required only
 * on creation, which would need the DB read to happen before validation.
 *
 * Every other field replaces the stored value when provided, and is left
 * unchanged when omitted (`undefined`) — this is done as two explicit
 * branches (row exists vs. doesn't), not an `ON CONFLICT ... DO UPDATE`
 * one-liner: a single query can't cleanly express "use this value if the
 * caller passed one, otherwise keep the column's own default on insert
 * but keep the *existing row's* value on update" when the column is
 * NOT NULL with a default — the two paths need genuinely different
 * fallbacks.
 */
export async function upsertCreatorProfile(
  userId: string,
  input: CreatorProfileInput
): Promise<CreatorProfileRow> {
  return withTransaction(async (client) => {
    const existing = await client.query<CreatorProfileRow>(
      "SELECT * FROM creator_profiles WHERE user_id = $1 FOR UPDATE",
      [userId]
    );
    const current = existing.rows[0];

    if (!current) {
      const inserted = await client.query<CreatorProfileRow>(
        `INSERT INTO creator_profiles (user_id, display_name, bio, expertise, languages, links)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
         RETURNING *`,
        [
          userId,
          input.displayName,
          input.bio ?? null,
          JSON.stringify(input.expertise ?? []),
          JSON.stringify(input.languages ?? []),
          JSON.stringify(input.links ?? []),
        ]
      );
      return inserted.rows[0]!;
    }

    const updated = await client.query<CreatorProfileRow>(
      `UPDATE creator_profiles
       SET display_name = $2, bio = $3, expertise = $4::jsonb, languages = $5::jsonb, links = $6::jsonb
       WHERE user_id = $1
       RETURNING *`,
      [
        userId,
        input.displayName,
        input.bio !== undefined ? input.bio : current.bio,
        JSON.stringify(input.expertise !== undefined ? input.expertise : current.expertise),
        JSON.stringify(input.languages !== undefined ? input.languages : current.languages),
        JSON.stringify(input.links !== undefined ? input.links : current.links),
      ]
    );
    return updated.rows[0]!;
  });
}
