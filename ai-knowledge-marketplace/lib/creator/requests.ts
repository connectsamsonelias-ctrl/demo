import { query, withTransaction } from "@/lib/db/pool";
import { requireCreatorProfileId, assertOwnsContentForAccessRequest } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import type { Session } from "@/lib/auth/session";
import type { AccessRequestRow } from "@/lib/db/types";
import { ValidationError } from "@/lib/errors";

export interface CreatorAccessRequestView extends AccessRequestRow {
  contentItemTitle: string;
  buyerOrganizationName: string;
}

export async function listAccessRequestsForCreator(session: Session): Promise<CreatorAccessRequestView[]> {
  const creatorId = await requireCreatorProfileId(session);
  return query<CreatorAccessRequestView>(
    `SELECT ar.*, ci.title AS "contentItemTitle", bp.organization_name AS "buyerOrganizationName"
     FROM access_requests ar
     JOIN content_items ci ON ci.id = ar.content_item_id
     JOIN buyer_profiles bp ON bp.id = ar.buyer_id
     WHERE ci.creator_id = $1
     ORDER BY ar.created_at DESC`,
    [creatorId]
  );
}

async function resolveAccessRequest(
  session: Session,
  accessRequestId: string,
  toStatus: "approved" | "rejected"
): Promise<AccessRequestRow> {
  await assertOwnsContentForAccessRequest(session, accessRequestId);

  return withTransaction(async (client) => {
    const rows = await client.query<AccessRequestRow>(
      "SELECT * FROM access_requests WHERE id = $1 FOR UPDATE",
      [accessRequestId]
    );
    const current = rows.rows[0]!; // assertOwnsContentForAccessRequest already confirmed this exists and is owned

    if (current.status !== "pending") {
      throw new ValidationError(
        `Cannot ${toStatus === "approved" ? "approve" : "reject"} a request in status '${current.status}' — only 'pending' requests can be resolved.`
      );
    }

    const updated = await client.query<AccessRequestRow>(
      "UPDATE access_requests SET status = $2 WHERE id = $1 RETURNING *",
      [accessRequestId, toStatus]
    );
    const result = updated.rows[0]!;
    await recordAuditLog(
      {
        actorId: session.userId,
        action: toStatus === "approved" ? "access_request.approve" : "access_request.reject",
        entityType: "access_requests",
        entityId: accessRequestId,
        oldState: { status: "pending" },
        newState: { status: toStatus },
      },
      client
    );
    return result;
  });
}

export async function approveAccessRequest(session: Session, accessRequestId: string): Promise<AccessRequestRow> {
  return resolveAccessRequest(session, accessRequestId, "approved");
}

export async function rejectAccessRequest(session: Session, accessRequestId: string): Promise<AccessRequestRow> {
  return resolveAccessRequest(session, accessRequestId, "rejected");
}
