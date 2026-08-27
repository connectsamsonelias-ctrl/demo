import { query, withTransaction } from "@/lib/db/pool";
import { z } from "@/lib/validation";
import { requireCreatorProfileId, assertOwnsContentItem } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import { assertValidRightsTransition } from "@/lib/rights/state-machine";
import type { Session } from "@/lib/auth/session";
import type { ContentItemRow } from "@/lib/db/types";
import { NotFoundError } from "@/lib/errors";

/**
 * The exact wording a creator agrees to at submission time, stored
 * verbatim on the row (ownership_attestation_text) rather than looked up
 * by version — if this text changes later, existing submissions must
 * still show what was actually agreed to, not the current wording.
 * Legal must review this copy before real launch; it exists so the MVP
 * has *something* concrete rather than an unspecified placeholder.
 */
export const OWNERSHIP_ATTESTATION_TEXT =
  "I own this content, or I have the necessary rights and authority to submit it to this platform " +
  "for the processing and potential licensing described in these terms.";

export const contentSubmissionSchema = z.object({
  sourceUrl: z.string().trim().url(),
  sourcePlatform: z.string().trim().min(1).max(50),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(1).max(100),
  language: z.string().trim().min(1).max(50),
  // Must be exactly `true` — a missing field or `false` both fail
  // validation. This is the MVP-scope simple-checkbox attestation
  // (platform-level ownership verification is a later, larger decision).
  ownershipAttested: z.literal(true, {
    errorMap: () => ({ message: "You must confirm you own or are authorized to submit this content" }),
  }),
});
export type ContentSubmissionInput = z.infer<typeof contentSubmissionSchema>;

/**
 * Fields a creator may still edit after submission. Deliberately
 * excludes sourceUrl (changing it is closer to a new submission than an
 * edit) and ownershipAttested (attestation is a one-time event captured
 * at creation, not something to silently re-confirm via a PATCH).
 * rights_status and the moderation status are never client-settable at
 * all — not present here, not accepted from any request body.
 */
export const contentUpdateSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(5000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  language: z.string().trim().min(1).max(50).optional(),
});
export type ContentUpdateInput = z.infer<typeof contentUpdateSchema>;

/**
 * Creates the content item at rights_status='SUBMITTED', then immediately
 * transitions it to 'AUTHORIZED_FOR_PROCESSING' in the same transaction.
 * This insert-then-transition (rather than inserting directly at
 * AUTHORIZED_FOR_PROCESSING) exists so 'SUBMITTED' is genuinely occupied,
 * even if only for a moment, and so the transition goes through the same
 * audited, guard-checked path as every other rights_status change. See
 * lib/rights/state-machine.ts for why AUTHORIZATION_PENDING is skipped:
 * contentSubmissionSchema already requires ownershipAttested=true as a
 * precondition of this function running at all, so there's no real
 * "pending authorization" window to represent.
 */
export async function createContentItem(
  session: Session,
  input: ContentSubmissionInput
): Promise<ContentItemRow> {
  const creatorId = await requireCreatorProfileId(session);

  return withTransaction(async (client) => {
    const inserted = await client.query<ContentItemRow>(
      `INSERT INTO content_items
         (creator_id, source_url, source_platform, title, description, language, category,
          status, rights_status, ownership_attested_at, ownership_attestation_text)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending_review', 'SUBMITTED', now(), $8)
       RETURNING *`,
      [
        creatorId,
        input.sourceUrl,
        input.sourcePlatform,
        input.title,
        input.description ?? null,
        input.language,
        input.category,
        OWNERSHIP_ATTESTATION_TEXT,
      ]
    );
    const submitted = inserted.rows[0]!;
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.submit",
        entityType: "content_items",
        entityId: submitted.id,
        newState: { rights_status: submitted.rights_status, source_url: submitted.source_url },
        metadata: { ownership_attestation_text: OWNERSHIP_ATTESTATION_TEXT },
      },
      client
    );

    assertValidRightsTransition(submitted.rights_status, "AUTHORIZED_FOR_PROCESSING");
    const authorized = await client.query<ContentItemRow>(
      "UPDATE content_items SET rights_status = 'AUTHORIZED_FOR_PROCESSING' WHERE id = $1 RETURNING *",
      [submitted.id]
    );
    const contentItem = authorized.rows[0]!;
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.authorized_for_processing",
        entityType: "content_items",
        entityId: contentItem.id,
        oldState: { rights_status: "SUBMITTED" },
        newState: { rights_status: "AUTHORIZED_FOR_PROCESSING" },
        metadata: { reason: "ownership attestation is a precondition of submission in this implementation" },
      },
      client
    );
    return contentItem;
  });
}

export async function listContentItemsForCreator(session: Session): Promise<ContentItemRow[]> {
  const creatorId = await requireCreatorProfileId(session);
  return query<ContentItemRow>(
    "SELECT * FROM content_items WHERE creator_id = $1 ORDER BY created_at DESC",
    [creatorId]
  );
}

export async function getContentItemForCreator(session: Session, contentItemId: string): Promise<ContentItemRow> {
  await assertOwnsContentItem(session, contentItemId);
  const rows = await query<ContentItemRow>("SELECT * FROM content_items WHERE id = $1", [contentItemId]);
  const item = rows[0];
  if (!item) throw new NotFoundError("Content item not found");
  return item;
}

export async function updateContentItem(
  session: Session,
  contentItemId: string,
  input: ContentUpdateInput
): Promise<ContentItemRow> {
  const current = await getContentItemForCreator(session, contentItemId);

  const rows = await query<ContentItemRow>(
    `UPDATE content_items
     SET title = $2, description = $3, category = $4, language = $5
     WHERE id = $1
     RETURNING *`,
    [
      contentItemId,
      input.title ?? current.title,
      input.description !== undefined ? input.description : current.description,
      input.category ?? current.category,
      input.language ?? current.language,
    ]
  );
  const updated = rows[0]!;
  await recordAuditLog({
    actorId: session.userId,
    action: "content.update",
    entityType: "content_items",
    entityId: updated.id,
    oldState: { title: current.title, description: current.description, category: current.category, language: current.language },
    newState: { title: updated.title, description: updated.description, category: updated.category, language: updated.language },
  });
  return updated;
}
