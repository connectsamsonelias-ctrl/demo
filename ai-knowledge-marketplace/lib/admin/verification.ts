import { query, withTransaction } from "@/lib/db/pool";
import { requireAdmin } from "@/lib/auth/admin";
import { recordAuditLog } from "@/lib/audit/log";
import { ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { CreatorProfileRow, BuyerProfileRow, VerificationStatus } from "@/lib/db/types";

/**
 * Milestone 18 closes a gap `lib/creator/profile.ts` and
 * `lib/buyer/profile.ts` have both flagged since Milestones 5/11:
 * `verification_status` exists on both profile tables but nothing could
 * ever change it away from its default `'unverified'`. There's no user-
 * facing "request verification" step in this implementation (nothing
 * gates on `'pending'` either) — an admin can act on any profile
 * directly, the same "manual admin action acceptable for v1" pattern
 * already used for takedowns (Milestone 17). Setting the *same* status
 * again is rejected rather than a silent no-op, so the audit trail only
 * ever records real decisions.
 */
export interface CreatorProfileForReview extends CreatorProfileRow {
  email: string;
}
export interface BuyerProfileForReview extends BuyerProfileRow {
  email: string;
}

export async function listCreatorProfilesForReview(session: Session): Promise<CreatorProfileForReview[]> {
  requireAdmin(session);
  return query<CreatorProfileForReview>(
    `SELECT cp.*, u.email
     FROM creator_profiles cp
     JOIN users u ON u.id = cp.user_id
     ORDER BY cp.created_at ASC`
  );
}

export async function listBuyerProfilesForReview(session: Session): Promise<BuyerProfileForReview[]> {
  requireAdmin(session);
  return query<BuyerProfileForReview>(
    `SELECT bp.*, u.email
     FROM buyer_profiles bp
     JOIN users u ON u.id = bp.user_id
     ORDER BY bp.created_at ASC`
  );
}

async function setVerificationStatus(
  session: Session,
  table: "creator_profiles" | "buyer_profiles",
  profileId: string,
  status: Extract<VerificationStatus, "verified" | "rejected">
): Promise<CreatorProfileRow | BuyerProfileRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const rows = await client.query<CreatorProfileRow | BuyerProfileRow>(
      `SELECT * FROM ${table} WHERE id = $1 FOR UPDATE`,
      [profileId]
    );
    const profile = rows.rows[0];
    if (!profile) throw new NotFoundError("Profile not found");
    if (profile.verification_status === status) {
      throw new ValidationError(`Profile is already '${status}'.`);
    }

    const updated = await client.query<CreatorProfileRow | BuyerProfileRow>(
      `UPDATE ${table} SET verification_status = $2 WHERE id = $1 RETURNING *`,
      [profileId, status]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: table === "creator_profiles" ? "creator_profile.verification_review" : "buyer_profile.verification_review",
        entityType: table,
        entityId: profileId,
        oldState: { verification_status: profile.verification_status },
        newState: { verification_status: status },
      },
      client
    );
    return updated.rows[0]!;
  });
}

export async function verifyCreatorProfile(session: Session, creatorProfileId: string): Promise<CreatorProfileRow> {
  return setVerificationStatus(session, "creator_profiles", creatorProfileId, "verified") as Promise<CreatorProfileRow>;
}
export async function rejectCreatorProfile(session: Session, creatorProfileId: string): Promise<CreatorProfileRow> {
  return setVerificationStatus(session, "creator_profiles", creatorProfileId, "rejected") as Promise<CreatorProfileRow>;
}
export async function verifyBuyerProfile(session: Session, buyerProfileId: string): Promise<BuyerProfileRow> {
  return setVerificationStatus(session, "buyer_profiles", buyerProfileId, "verified") as Promise<BuyerProfileRow>;
}
export async function rejectBuyerProfile(session: Session, buyerProfileId: string): Promise<BuyerProfileRow> {
  return setVerificationStatus(session, "buyer_profiles", buyerProfileId, "rejected") as Promise<BuyerProfileRow>;
}
