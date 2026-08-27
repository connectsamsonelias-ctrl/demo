import { query, withTransaction } from "@/lib/db/pool";
import { requireCreatorProfileId, assertOwnsContentForAccessRequest } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import type { Session } from "@/lib/auth/session";
import type { AccessRequestRow, LicensingTermsRow } from "@/lib/db/types";
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

    if (toStatus === "approved") {
      await createLicenseForApprovedRequest(session, client, result);
    }

    return result;
  });
}

/**
 * Milestone 14: approving a request now creates the actual `licenses`
 * row, not just flipping the request's status. Requires `licensing_terms`
 * to already exist for the content item — approval never fabricates a
 * `terms_snapshot` for terms the creator hasn't set (Screen C05 is meant
 * to happen before this point in the workflow). `license_type` is a fixed
 * `'standard'` for every V1 license — the spec flags "per-license-type
 * variance" as a still-open business decision, not resolved here.
 *
 * `content_items.rights_status` is deliberately left untouched: a content
 * item can have many concurrent licenses to different buyers (1:many),
 * so advancing a single-valued `rights_status` here would repeat the same
 * conflation Milestone 12 already rejected for access requests. See
 * lib/rights/state-machine.ts for the full reasoning — LICENSE_REQUESTED/
 * LICENSED/ACTIVE remain graph-only nodes, still untriggered.
 *
 * Status starts at 'pending_payment' (migration 009's own rule): a
 * license is never activated on an assumption, only by a verified
 * payment webhook (Milestone 15).
 */
async function createLicenseForApprovedRequest(
  session: Session,
  client: Parameters<Parameters<typeof withTransaction>[0]>[0],
  request: AccessRequestRow
): Promise<void> {
  const contentRows = await client.query<{ id: string; creator_id: string }>(
    "SELECT id, creator_id FROM content_items WHERE id = $1",
    [request.content_item_id]
  );
  const contentItem = contentRows.rows[0]!; // approval already confirmed the request/content exist

  const termsRows = await client.query<LicensingTermsRow>(
    "SELECT * FROM licensing_terms WHERE content_item_id = $1",
    [contentItem.id]
  );
  const terms = termsRows.rows[0];
  if (!terms) {
    throw new ValidationError(
      "Cannot approve this request — set licensing terms for this content before approving requests."
    );
  }

  const termsSnapshot = {
    allowed_use_types: terms.allowed_use_types,
    license_duration: terms.license_duration,
    geographic_scope: terms.geographic_scope,
    commercial_status: terms.commercial_status,
    pricing_model: terms.pricing_model,
    base_price: terms.base_price,
    creator_share_percent: terms.creator_share_percent,
    platform_share_percent: terms.platform_share_percent,
  };

  const licenseRows = await client.query<{ id: string }>(
    `INSERT INTO licenses
       (content_item_id, creator_id, buyer_id, access_request_id, license_type, terms_snapshot)
     VALUES ($1, $2, $3, $4, 'standard', $5::jsonb)
     RETURNING id`,
    [contentItem.id, contentItem.creator_id, request.buyer_id, request.id, JSON.stringify(termsSnapshot)]
  );
  const license = licenseRows.rows[0]!;

  await recordAuditLog(
    {
      actorId: session.userId,
      action: "license.create",
      entityType: "licenses",
      entityId: license.id,
      newState: { status: "pending_payment", terms_snapshot: termsSnapshot },
      metadata: { access_request_id: request.id, content_item_id: contentItem.id },
    },
    client
  );
}

export async function approveAccessRequest(session: Session, accessRequestId: string): Promise<AccessRequestRow> {
  return resolveAccessRequest(session, accessRequestId, "approved");
}

export async function rejectAccessRequest(session: Session, accessRequestId: string): Promise<AccessRequestRow> {
  return resolveAccessRequest(session, accessRequestId, "rejected");
}
