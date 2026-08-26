import { query, withTransaction } from "@/lib/db/pool";
import { assertOwnsContentItem } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import type { Session } from "@/lib/auth/session";
import type { ContentItemRow } from "@/lib/db/types";
import { ValidationError } from "@/lib/errors";

/**
 * Milestone 9 needs *some* content reachable at rights_status='LISTED'
 * for the marketplace to show anything, but the full legal state
 * machine (SUBMITTED -> AUTHORIZATION_PENDING -> AUTHORIZED_FOR_PROCESSING
 * -> ANALYSIS_COMPLETE -> LICENSING_ELIGIBLE -> LISTED) belongs to
 * Milestone 13 — inventing those intermediate states' semantics here
 * would mean guessing at legal meaning ahead of the milestone that owns
 * it. This is a deliberate, minimal simplification: a creator can move
 * SUBMITTED directly to LISTED, gated only by "has a completed audit"
 * (preserving at least that much of the real state machine's intent —
 * ANALYSIS_COMPLETE precedes LICENSING_ELIGIBLE in the spec).
 *
 * Known gap, not fixed here: this does NOT check content_items.status
 * (the admin moderation gate) — because nothing can ever set it to
 * 'approved' yet; Milestone 18 (Admin) hasn't shipped. That means
 * anything a creator lists today goes live with zero moderation review.
 * This is a real trust/safety gap that must be closed before public
 * launch, not a corner cut silently.
 */
export async function listContentOnMarketplace(session: Session, contentItemId: string): Promise<ContentItemRow> {
  await assertOwnsContentItem(session, contentItemId);

  return withTransaction(async (client) => {
    const rows = await client.query<ContentItemRow>(
      "SELECT * FROM content_items WHERE id = $1 FOR UPDATE",
      [contentItemId]
    );
    const item = rows.rows[0]!; // assertOwnsContentItem already confirmed this exists and is owned

    if (item.rights_status !== "SUBMITTED") {
      throw new ValidationError(
        `Cannot list content in rights_status '${item.rights_status}' — only 'SUBMITTED' content can be listed.`
      );
    }

    const auditRows = await client.query(
      "SELECT 1 FROM knowledge_assets WHERE content_item_id = $1 AND asset_type = 'knowledge_audit'",
      [contentItemId]
    );
    if (auditRows.rows.length === 0) {
      throw new ValidationError("A completed Knowledge Audit is required before listing on the marketplace.");
    }

    const updated = await client.query<ContentItemRow>(
      "UPDATE content_items SET rights_status = 'LISTED' WHERE id = $1 RETURNING *",
      [contentItemId]
    );
    const result = updated.rows[0]!;
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.listed",
        entityType: "content_items",
        entityId: contentItemId,
        oldState: { rights_status: item.rights_status },
        newState: { rights_status: "LISTED" },
      },
      client
    );
    return result;
  });
}

export async function unlistContentFromMarketplace(session: Session, contentItemId: string): Promise<ContentItemRow> {
  await assertOwnsContentItem(session, contentItemId);

  return withTransaction(async (client) => {
    const rows = await client.query<ContentItemRow>(
      "SELECT * FROM content_items WHERE id = $1 FOR UPDATE",
      [contentItemId]
    );
    const item = rows.rows[0]!;

    if (item.rights_status !== "LISTED") {
      throw new ValidationError(
        `Cannot unlist content in rights_status '${item.rights_status}' — only 'LISTED' content can be withdrawn.`
      );
    }

    const updated = await client.query<ContentItemRow>(
      "UPDATE content_items SET rights_status = 'WITHDRAWN' WHERE id = $1 RETURNING *",
      [contentItemId]
    );
    const result = updated.rows[0]!;
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.unlisted",
        entityType: "content_items",
        entityId: contentItemId,
        oldState: { rights_status: "LISTED" },
        newState: { rights_status: "WITHDRAWN" },
      },
      client
    );
    return result;
  });
}

/** Read-only convenience for the dashboard: does this content item have a completed audit yet? */
export async function hasCompletedAudit(contentItemId: string): Promise<boolean> {
  const rows = await query(
    "SELECT 1 FROM knowledge_assets WHERE content_item_id = $1 AND asset_type = 'knowledge_audit'",
    [contentItemId]
  );
  return rows.length > 0;
}
