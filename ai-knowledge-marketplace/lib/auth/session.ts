import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import type { NextRequest } from "next/server";
import { getEnv } from "@/lib/env";
import { authOptions } from "@/lib/auth/next-auth-options";
import type { Role } from "@/lib/auth/roles";

export interface Session {
  userId: string;
  email: string;
  role: Role;
}

/**
 * Auth provider abstraction. Milestone 1 defines the shape only — no real
 * provider is wired up yet (Auth provider selection is an open decision;
 * see docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md, Step 2A). Milestone 3
 * ("Authentication") replaces DevStubAuthProvider with a real
 * implementation of this same interface, so every caller of getSession()
 * elsewhere in the app is unaffected by that swap.
 */
export interface AuthProvider {
  getSession(request: Request): Promise<Session | null>;
}

/**
 * Deliberately not wired into any route yet. It exists so lib/auth/authorize.ts
 * and its tests have something concrete to run against before a real
 * provider is chosen. It must never be reachable outside NODE_ENV=test/development.
 */
export class DevStubAuthProvider implements AuthProvider {
  async getSession(request: Request): Promise<Session | null> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("DevStubAuthProvider must never be used in production");
    }
    const header = request.headers.get("x-dev-session");
    if (!header) return null;
    try {
      const parsed = JSON.parse(header) as Session;
      return parsed;
    } catch {
      return null;
    }
  }
}

/**
 * Reads the NextAuth-issued JWT session cookie. In practice `request` is
 * always a NextRequest here (every real caller is a Next.js Route
 * Handler); the interface is typed against the plain Web `Request` so
 * lib/auth/authorize.ts and its tests don't depend on Next.js types.
 */
export class NextAuthProvider implements AuthProvider {
  async getSession(request: Request): Promise<Session | null> {
    const token = await getToken({
      req: request as unknown as NextRequest,
      secret: getEnv().NEXTAUTH_SECRET,
    });
    if (!token) return null;
    return { userId: token.userId, email: token.email as string, role: token.role };
  }
}

let provider: AuthProvider = new NextAuthProvider();

export function setAuthProvider(p: AuthProvider): void {
  provider = p;
}

export function getAuthProvider(): AuthProvider {
  return provider;
}

export async function getSession(request: Request): Promise<Session | null> {
  return provider.getSession(request);
}

/**
 * For Server Components/Pages, which have no incoming Request object to
 * read cookies from — only `getServerSession(authOptions)` (backed by
 * `next/headers`) works there. Route Handlers must keep using
 * getSession()/requireRole() above; this is a separate path, not a
 * replacement, and — unlike getSession() — is not swappable via
 * setAuthProvider() for tests, since App Router pages are not unit
 * tested the way route handlers are in this project.
 */
export async function getPageSession(): Promise<Session | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return { userId: session.user.id, email: session.user.email, role: session.user.role };
}
