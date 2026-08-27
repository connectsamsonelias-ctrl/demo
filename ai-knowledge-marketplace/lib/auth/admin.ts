import { ForbiddenError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

/**
 * Defense-in-depth role check for lib/admin/* functions. The primary
 * gate is always requireRole(request, ["admin"]) at the API route layer
 * (same as every other role-gated route in this app) — this exists so a
 * lib function is never accidentally callable with a non-admin session
 * from anywhere else (a future job, a script, a different route) without
 * a route-level check being re-derived correctly.
 */
export function requireAdmin(session: Session): void {
  if (session.role !== "admin") {
    throw new ForbiddenError("Only admins may perform this action");
  }
}
