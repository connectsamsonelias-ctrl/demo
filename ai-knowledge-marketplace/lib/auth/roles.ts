/**
 * Stored account roles. "visitor" is deliberately excluded — it describes
 * an unauthenticated caller, never a `users.role` value.
 */
export const ROLES = ["creator", "buyer", "admin"] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}
