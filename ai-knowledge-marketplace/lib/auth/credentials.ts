import { query, withTransaction } from "@/lib/db/pool";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { recordAuditLog } from "@/lib/audit/log";
import type { Role } from "@/lib/auth/roles";
import type { Session } from "@/lib/auth/session";

/**
 * Roles that may self-register through public signup. Deliberately a
 * separate, narrower type from the full Role union — an admin account
 * must never be creatable by an unauthenticated request. Admin
 * provisioning is out of scope for this milestone (manual DB
 * provisioning for now; an admin-invite flow is a later milestone).
 */
export const PUBLIC_SIGNUP_ROLES = ["creator", "buyer"] as const;
export type PublicSignupRole = (typeof PUBLIC_SIGNUP_ROLES)[number];

export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super("An account with this email already exists");
    this.name = "EmailAlreadyRegisteredError";
  }
}

export async function createUserWithPassword(
  email: string,
  password: string,
  role: PublicSignupRole
): Promise<{ id: string; email: string; role: Role }> {
  const passwordHash = await hashPassword(password);
  return withTransaction(async (client) => {
    const existing = await client.query<{ id: string }>("SELECT id FROM users WHERE email = $1", [
      email,
    ]);
    if (existing.rows.length > 0) {
      throw new EmailAlreadyRegisteredError();
    }
    const inserted = await client.query<{ id: string; email: string; role: Role }>(
      `INSERT INTO users (email, role, password_hash) VALUES ($1, $2, $3)
       RETURNING id, email, role`,
      [email, role, passwordHash]
    );
    const user = inserted.rows[0]!;
    await recordAuditLog(
      { actorId: user.id, action: "user.signup", entityType: "users", entityId: user.id, newState: { role } },
      client
    );
    return user;
  });
}

/**
 * Verifies email+password and returns the resulting session shape, or
 * null on any failure. Deliberately collapses "no such user", "wrong
 * password", and "account suspended" into the same null result — a
 * distinguishable error for any of these would let a caller enumerate
 * which emails have accounts, or which accounts are suspended.
 */
export async function verifyCredentials(email: string, password: string): Promise<Session | null> {
  const rows = await query<{ id: string; email: string; role: Role; status: string; password_hash: string | null }>(
    "SELECT id, email, role, status, password_hash FROM users WHERE email = $1",
    [email]
  );
  const user = rows[0];
  if (!user || !user.password_hash || user.status !== "active") return null;
  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) return null;
  return { userId: user.id, email: user.email, role: user.role };
}
