import { query, withTransaction } from "@/lib/db/pool";
import { requireAdmin } from "@/lib/auth/admin";
import { recordAuditLog } from "@/lib/audit/log";
import { ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { UserRow } from "@/lib/db/types";

/**
 * Read-only user list for admin review (`user.review`). Deliberately
 * does not surface creator/buyer `verification_status` review here —
 * that's a separate, larger KYC-style feature nothing in the app
 * currently gates on, and is left as an explicit, undecided gap rather
 * than a half-built one. Password hashes are never selected.
 */
export async function listUsersForReview(session: Session): Promise<UserRow[]> {
  requireAdmin(session);
  return query<UserRow>(
    "SELECT id, email, role, status, created_at, updated_at FROM users ORDER BY created_at DESC"
  );
}

/**
 * `user.suspend`. A suspended account is immediately blocked from
 * signing in — verifyCredentials (lib/auth/credentials.ts) already
 * refuses any non-'active' user. Deliberately does NOT cascade to the
 * user's existing content or licenses (e.g. auto-unlisting everything
 * they own) — that's real future work if it turns out to be needed, not
 * invented here; use lib/admin/content.ts's suspendContent separately
 * for that. Suspending an admin account is refused, to avoid an admin
 * locking out themselves or another admin through this endpoint.
 */
export async function suspendUser(session: Session, userId: string): Promise<UserRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const rows = await client.query<UserRow>(
      "SELECT id, email, role, status, created_at, updated_at FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    const user = rows.rows[0];
    if (!user) throw new NotFoundError("User not found");
    if (user.role === "admin") {
      throw new ValidationError("Cannot suspend an admin account through this action");
    }
    if (user.status !== "active") {
      throw new ValidationError(`Cannot suspend a user in status '${user.status}' — only 'active' users can be suspended.`);
    }

    const updated = await client.query<UserRow>(
      "UPDATE users SET status = 'suspended' WHERE id = $1 RETURNING id, email, role, status, created_at, updated_at",
      [userId]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "user.suspend",
        entityType: "users",
        entityId: userId,
        oldState: { status: "active" },
        newState: { status: "suspended" },
      },
      client
    );
    return updated.rows[0]!;
  });
}

export async function reinstateUser(session: Session, userId: string): Promise<UserRow> {
  requireAdmin(session);
  return withTransaction(async (client) => {
    const rows = await client.query<UserRow>(
      "SELECT id, email, role, status, created_at, updated_at FROM users WHERE id = $1 FOR UPDATE",
      [userId]
    );
    const user = rows.rows[0];
    if (!user) throw new NotFoundError("User not found");
    if (user.status !== "suspended") {
      throw new ValidationError(`Cannot reinstate a user in status '${user.status}' — only 'suspended' users can be reinstated.`);
    }

    const updated = await client.query<UserRow>(
      "UPDATE users SET status = 'active' WHERE id = $1 RETURNING id, email, role, status, created_at, updated_at",
      [userId]
    );
    await recordAuditLog(
      {
        actorId: session.userId,
        action: "user.reinstate",
        entityType: "users",
        entityId: userId,
        oldState: { status: "suspended" },
        newState: { status: "active" },
      },
      client
    );
    return updated.rows[0]!;
  });
}
