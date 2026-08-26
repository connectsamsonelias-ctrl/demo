import { getSession, type Session } from "@/lib/auth/session";
import type { Role } from "@/lib/auth/roles";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

/**
 * Server-side authorization gate. Every API route that requires a
 * specific role must call this and use the returned Session — never trust
 * a role/user id passed in the request body or a client-set header.
 * (The dev-stub session header is the one deliberate exception, and only
 * because it is itself rejected outside development/test — see session.ts.)
 */
export async function requireRole(request: Request, allowed: Role[]): Promise<Session> {
  const session = await getSession(request);
  if (!session) {
    throw new UnauthorizedError();
  }
  if (!allowed.includes(session.role)) {
    throw new ForbiddenError(`Role '${session.role}' is not permitted for this action`);
  }
  return session;
}

export async function requireSession(request: Request): Promise<Session> {
  const session = await getSession(request);
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
}
