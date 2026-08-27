import { query, withTransaction } from "@/lib/db/pool";
import { assertOwnsContentItem } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import { assertValidRightsTransition } from "@/lib/rights/state-machine";
import { ValidationError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { ContentItemRow } from "@/lib/db/types";

/**
 * Listing goes through the centralized rights state machine
 * (lib/rights/state-machine.ts, Milestone 13): a content item can be
 * listed exactly when it's reached LICENSING_ELIGIBLE, which the audit
 * worker sets precisely when a Knowledge Audit succeeds
 * (workers/audit/processor.ts) — so the separate "has a completed audit"
 * check this function used before Milestone 13 is now redundant with the
 * rights_status check and has been removed.
 *
 * Milestone 17 closes a gap flagged since Milestone 9: listing now also
 * requires content_items.status === 'approved' — the admin moderation
 * gate (lib/admin/content.ts). Before this, nothing could ever set that
 * column to 'approved', so anything a creator listed went live with zero
 * moderation review — exactly the "[LEGAL/OPS — MUST EXIST DAY ONE]" gap
 * the kickoff review flagged. Both gates are independent and both must
 * pass: a rights-eligible-but-unreviewed item still can't be listed, and
 * (once Milestone 18 or later might allow it) an approved-but-not-yet-
 * rights-eligible item still can't either.
 */
export async function listContentOnMarketplace(session: Session, contentItemId: string): Promise<ContentItemRow> {
  await assertOwnsContentItem(session, contentItemId);

  return withTransaction(async (client) => {
    const rows = await client.query<ContentItemRow>(
      "SELECT * FROM content_items WHERE id = $1 FOR UPDATE",
      [contentItemId]
    );
    const item = rows.rows[0]!; // assertOwnsContentItem already confirmed this exists and is owned

    if (item.status !== "approved") {
      throw new ValidationError(
        `Cannot list content with moderation status '${item.status}' — content must be approved by an admin before it can be listed.`
      );
    }
    assertValidRightsTransition(item.rights_status, "LISTED");

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

    assertValidRightsTransition(item.rights_status, "WITHDRAWN");

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
