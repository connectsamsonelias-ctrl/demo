import { query } from "@/lib/db/pool";
import { z } from "@/lib/validation";
import { requireBuyerProfileId } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import type { Session } from "@/lib/auth/session";
import type { AccessRequestRow } from "@/lib/db/types";
import { NotFoundError } from "@/lib/errors";

/**
 * Screen B04. contentItemId is the target content item; the "Organization"
 * field the screen shows is not user-entered here — it's derived from
 * the buyer's own profile (requireBuyerProfileId), same reasoning as
 * why creator content submission doesn't ask the creator to re-type
 * their own name.
 */
export const accessRequestSchema = z.object({
  contentItemId: z.string().uuid(),
  intendedUse: z.string().trim().min(1).max(2000),
  requestedScope: z.string().trim().min(1).max(500),
  requestedDuration: z.string().trim().max(200).optional(),
});
export type AccessRequestInput = z.infer<typeof accessRequestSchema>;

const IN_FLIGHT_STATUSES = ["pending", "approved"] as const;

export async function createAccessRequest(session: Session, input: AccessRequestInput): Promise<AccessRequestRow> {
  const buyerId = await requireBuyerProfileId(session);

  // Only a publicly LISTED item can be requested — same rule the
  // marketplace itself enforces, checked directly against
  // content_items rather than going through lib/marketplace.ts's public
  // read layer, since this is an authenticated, not anonymous, path.
  const contentRows = await query<{ id: string }>(
    "SELECT id FROM content_items WHERE id = $1 AND rights_status = 'LISTED'",
    [input.contentItemId]
  );
  if (contentRows.length === 0) {
    throw new NotFoundError("Listing not found");
  }

  const existing = await query<AccessRequestRow>(
    `SELECT * FROM access_requests
     WHERE content_item_id = $1 AND buyer_id = $2 AND status = ANY($3)
     ORDER BY created_at DESC LIMIT 1`,
    [input.contentItemId, buyerId, IN_FLIGHT_STATUSES]
  );
  if (existing[0]) return existing[0];

  const inserted = await query<AccessRequestRow>(
    `INSERT INTO access_requests (content_item_id, buyer_id, intended_use, requested_scope, requested_duration)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [input.contentItemId, buyerId, input.intendedUse, input.requestedScope, input.requestedDuration ?? null]
  );
  const request = inserted[0]!;
  await recordAuditLog({
    actorId: session.userId,
    action: "access_request.create",
    entityType: "access_requests",
    entityId: request.id,
    newState: { status: request.status },
    metadata: { content_item_id: input.contentItemId },
  });
  return request;
}

export interface BuyerAccessRequestView extends AccessRequestRow {
  contentItemTitle: string;
}

export async function listAccessRequestsForBuyer(session: Session): Promise<BuyerAccessRequestView[]> {
  const buyerId = await requireBuyerProfileId(session);
  return query<BuyerAccessRequestView>(
    `SELECT ar.*, ci.title AS "contentItemTitle"
     FROM access_requests ar
     JOIN content_items ci ON ci.id = ar.content_item_id
     WHERE ar.buyer_id = $1
     ORDER BY ar.created_at DESC`,
    [buyerId]
  );
}

/** For the asset detail page: does the current buyer already have an in-flight or resolved request for this item? Returns null if they've never requested it (or aren't signed in as a buyer). */
export async function getOwnAccessRequestForContent(
  session: Session,
  contentItemId: string
): Promise<AccessRequestRow | null> {
  if (session.role !== "buyer") return null;
  const buyerId = await requireBuyerProfileId(session);
  const rows = await query<AccessRequestRow>(
    `SELECT * FROM access_requests
     WHERE content_item_id = $1 AND buyer_id = $2
     ORDER BY created_at DESC LIMIT 1`,
    [contentItemId, buyerId]
  );
  return rows[0] ?? null;
}
