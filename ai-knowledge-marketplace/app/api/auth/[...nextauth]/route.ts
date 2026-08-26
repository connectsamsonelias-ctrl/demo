import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth/next-auth-options";

/**
 * Mounts NextAuth's own conventional endpoints under /api/auth/*:
 * /api/auth/csrf, /api/auth/callback/credentials (login submission),
 * /api/auth/signout, /api/auth/session, /api/auth/providers.
 *
 * These do NOT collide with the sibling static routes in this directory
 * (signup/route.ts, me/route.ts) — Next.js resolves a specific static
 * segment before falling back to a catch-all route, so /api/auth/signup
 * and /api/auth/me are handled by their own files, never by this one.
 * See docs/decisions/0001-auth-provider.md for why "login"/"logout" map
 * to NextAuth's built-in paths rather than custom /api/auth/login,
 * /api/auth/logout routes.
 */
const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
