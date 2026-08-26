import { query } from "@/lib/db/pool";
import type { Session } from "@/lib/auth/session";
import { ForbiddenError, NotFoundError } from "@/lib/errors";

/**
 * Resource-ownership checks. can() (permissions.ts) only answers "could
 * this role ever do this"; these answer "does this specific row belong
 * to this specific signed-in user". Every route that reads or mutates a
 * single creator's/buyer's resource must call one of these before acting
 * on it — role checks alone are not enough (Milestone 1's requireRole
 * would happily let any creator edit any other creator's content).
 *
 * Deliberately raise NotFoundError, not ForbiddenError, when a resource
 * exists but belongs to someone else — a 403 on someone else's private
 * resource confirms it exists; a 404 doesn't. This mirrors the same
 * enumeration-avoidance reasoning as verifyCredentials() in Milestone 3.
 */

export async function getCreatorProfileId(userId: string): Promise<string | null> {
  const rows = await query<{ id: string }>("SELECT id FROM creator_profiles WHERE user_id = $1", [
    userId,
  ]);
  return rows[0]?.id ?? null;
}

export async function getBuyerProfileId(userId: string): Promise<string | null> {
  const rows = await query<{ id: string }>("SELECT id FROM buyer_profiles WHERE user_id = $1", [
    userId,
  ]);
  return rows[0]?.id ?? null;
}

/** Throws if the session's role is right but no profile has been created yet (Milestone 5/11's job). */
export async function requireCreatorProfileId(session: Session): Promise<string> {
  if (session.role !== "creator") throw new ForbiddenError("Only creators have a creator profile");
  const id = await getCreatorProfileId(session.userId);
  if (!id) throw new NotFoundError("Creator profile not found — complete profile setup first");
  return id;
}

export async function requireBuyerProfileId(session: Session): Promise<string> {
  if (session.role !== "buyer") throw new ForbiddenError("Only buyers have a buyer profile");
  const id = await getBuyerProfileId(session.userId);
  if (!id) throw new NotFoundError("Buyer profile not found — complete profile setup first");
  return id;
}

export async function assertOwnsContentItem(session: Session, contentItemId: string): Promise<void> {
  const creatorId = await requireCreatorProfileId(session);
  const rows = await query<{ creator_id: string }>(
    "SELECT creator_id FROM content_items WHERE id = $1",
    [contentItemId]
  );
  if (!rows[0] || rows[0].creator_id !== creatorId) {
    throw new NotFoundError("Content item not found");
  }
}

export async function assertOwnsAccessRequestAsBuyer(session: Session, accessRequestId: string): Promise<void> {
  const buyerId = await requireBuyerProfileId(session);
  const rows = await query<{ buyer_id: string }>(
    "SELECT buyer_id FROM access_requests WHERE id = $1",
    [accessRequestId]
  );
  if (!rows[0] || rows[0].buyer_id !== buyerId) {
    throw new NotFoundError("Access request not found");
  }
}

/**
 * A creator approving/rejecting a request against their own content —
 * ownership runs through content_items.creator_id, not the request
 * itself (the request belongs to the buyer; the *decision* belongs to
 * the creator who owns the content being requested).
 */
export async function assertOwnsContentForAccessRequest(session: Session, accessRequestId: string): Promise<void> {
  const creatorId = await requireCreatorProfileId(session);
  const rows = await query<{ creator_id: string }>(
    `SELECT ci.creator_id
     FROM access_requests ar
     JOIN content_items ci ON ci.id = ar.content_item_id
     WHERE ar.id = $1`,
    [accessRequestId]
  );
  if (!rows[0] || rows[0].creator_id !== creatorId) {
    throw new NotFoundError("Access request not found");
  }
}

/** A license has two legitimate owners — the creator side and the buyer side. */
export async function assertOwnsLicense(session: Session, licenseId: string): Promise<void> {
  const rows = await query<{ creator_id: string; buyer_id: string }>(
    "SELECT creator_id, buyer_id FROM licenses WHERE id = $1",
    [licenseId]
  );
  const license = rows[0];
  if (!license) throw new NotFoundError("License not found");

  if (session.role === "creator") {
    const creatorId = await getCreatorProfileId(session.userId);
    if (creatorId === license.creator_id) return;
  } else if (session.role === "buyer") {
    const buyerId = await getBuyerProfileId(session.userId);
    if (buyerId === license.buyer_id) return;
  }
  throw new NotFoundError("License not found");
}
