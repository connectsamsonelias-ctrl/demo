import { query, withTransaction } from "@/lib/db/pool";
import { requireAdmin } from "@/lib/auth/admin";
import { recordAuditLog } from "@/lib/audit/log";
import { assertValidRightsTransition } from "@/lib/rights/state-machine";
import { ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { ContentItemRow, ContentModerationStatus } from "@/lib/db/types";

export interface AdminContentView extends ContentItemRow {
  creatorDisplayName: string;
}

/**
 * The moderation queue (Screen A02). Defaults to 'pending_review' — the
 * actual review queue — but accepts any status so an admin can also look
 * back at what's already been approved/rejected/suspended.
 */
export async function listContentForModeration(
  session: Session,
  status: ContentModerationStatus = "pending_review"
): Promise<AdminContentView[]> {
  requireAdmin(session);
  return query<AdminContentView>(
    `SELECT ci.*, cp.display_name AS "creatorDisplayName"
     FROM content_items ci
     JOIN creator_profiles cp ON cp.id = ci.creator_id
     WHERE ci.status = $1
     ORDER BY ci.created_at ASC`,
    [status]
  );
}

type TransactionClient = Parameters<Parameters<typeof withTransaction>[0]>[0];

async function loadForUpdate(client: TransactionClient, contentItemId: string): Promise<ContentItemRow> {
  const rows = await client.query<ContentItemRow>("SELECT * FROM content_items WHERE id = $1 FOR UPDATE", [
    contentItemId,
  ]);
  const item = rows.rows[0];
  if (!item) throw new NotFoundError("Content item not found");
  return item;
}

export async function approveContent(session: Session, contentItemId: string): Promise<ContentItemRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const item = await loadForUpdate(client, contentItemId);
    if (item.status !== "pending_review") {
      throw new ValidationError(
        `Cannot approve content in moderation status '${item.status}' — only 'pending_review' content can be approved.`
      );
    }
    const updated = await client.query<ContentItemRow>(
      "UPDATE content_items SET status = 'approved' WHERE id = $1 RETURNING *",
      [contentItemId]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.moderate_approve",
        entityType: "content_items",
        entityId: contentItemId,
        oldState: { status: "pending_review" },
        newState: { status: "approved" },
      },
      client
    );
    return updated.rows[0]!;
  });
}

export async function rejectContent(session: Session, contentItemId: string, reason?: string): Promise<ContentItemRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const item = await loadForUpdate(client, contentItemId);
    if (item.status !== "pending_review") {
      throw new ValidationError(
        `Cannot reject content in moderation status '${item.status}' — only 'pending_review' content can be rejected.`
      );
    }
    const updated = await client.query<ContentItemRow>(
      "UPDATE content_items SET status = 'rejected' WHERE id = $1 RETURNING *",
      [contentItemId]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.moderate_reject",
        entityType: "content_items",
        entityId: contentItemId,
        oldState: { status: "pending_review" },
        newState: { status: "rejected" },
        metadata: reason ? { reason } : undefined,
      },
      client
    );
    return updated.rows[0]!;
  });
}

/**
 * Takedown action (spec: "manual admin action acceptable for v1" for the
 * DMCA/takedown process). Only 'approved' content can be suspended —
 * suspending something already pending/rejected doesn't mean anything.
 * If the content is currently LISTED, this also drives rights_status
 * LISTED -> SUSPENDED (an edge lib/rights/state-machine.ts defined but
 * never triggered before this milestone), removing it from the public
 * marketplace. If rights_status is anything else — most importantly
 * ACTIVE, where a real license exists — there is deliberately no valid
 * transition out, so rights_status is left untouched: the moderation
 * status still flips (blocking any future re-listing), but an active
 * license is never silently killed by an admin content action, same
 * invariant as the ACTIVE/WITHDRAWN safety property.
 */
export async function suspendContent(session: Session, contentItemId: string, reason?: string): Promise<ContentItemRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const item = await loadForUpdate(client, contentItemId);
    if (item.status !== "approved") {
      throw new ValidationError(
        `Cannot suspend content in moderation status '${item.status}' — only 'approved' content can be suspended.`
      );
    }

    const willSuspendRights = item.rights_status === "LISTED";
    if (willSuspendRights) {
      assertValidRightsTransition(item.rights_status, "SUSPENDED");
    }

    const updated = await client.query<ContentItemRow>(
      willSuspendRights
        ? "UPDATE content_items SET status = 'suspended', rights_status = 'SUSPENDED' WHERE id = $1 RETURNING *"
        : "UPDATE content_items SET status = 'suspended' WHERE id = $1 RETURNING *",
      [contentItemId]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.moderate_suspend",
        entityType: "content_items",
        entityId: contentItemId,
        oldState: { status: "approved", rights_status: item.rights_status },
        newState: { status: "suspended", rights_status: willSuspendRights ? "SUSPENDED" : item.rights_status },
        metadata: reason ? { reason } : undefined,
      },
      client
    );
    return updated.rows[0]!;
  });
}

/** The reverse of suspendContent — see its docstring for the rights_status symmetry. */
export async function reinstateContent(session: Session, contentItemId: string): Promise<ContentItemRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const item = await loadForUpdate(client, contentItemId);
    if (item.status !== "suspended") {
      throw new ValidationError(
        `Cannot reinstate content in moderation status '${item.status}' — only 'suspended' content can be reinstated.`
      );
    }

    const willReinstateRights = item.rights_status === "SUSPENDED";
    if (willReinstateRights) {
      assertValidRightsTransition(item.rights_status, "LISTED");
    }

    const updated = await client.query<ContentItemRow>(
      willReinstateRights
        ? "UPDATE content_items SET status = 'approved', rights_status = 'LISTED' WHERE id = $1 RETURNING *"
        : "UPDATE content_items SET status = 'approved' WHERE id = $1 RETURNING *",
      [contentItemId]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "content.moderate_reinstate",
        entityType: "content_items",
        entityId: contentItemId,
        oldState: { status: "suspended", rights_status: item.rights_status },
        newState: { status: "approved", rights_status: willReinstateRights ? "LISTED" : item.rights_status },
      },
      client
    );
    return updated.rows[0]!;
  });
}
