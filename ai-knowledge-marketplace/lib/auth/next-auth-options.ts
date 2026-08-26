import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { verifyCredentials } from "@/lib/auth/credentials";

/**
 * Credentials-only, JWT-session NextAuth config. No database adapter —
 * Milestone 2's `users` table doesn't match the shape NextAuth's official
 * Postgres adapter expects, and a JWT session needs none of that. See
 * docs/decisions/0001-auth-provider.md for why v4 (stable) over the v5
 * beta, and for how /api/auth/login and /api/auth/logout from the source
 * spec map onto NextAuth's own conventional endpoints.
 *
 * No explicit `secret:` here, on purpose: NextAuth reads
 * `process.env.NEXTAUTH_SECRET` itself when it's omitted. An earlier
 * version of this file called getEnv().NEXTAUTH_SECRET directly in this
 * object literal, which evaluates at *module load*, not at request
 * time — and lib/auth/session.ts imports this module, so any unit test
 * that transitively imports session.ts without DATABASE_URL/
 * NEXTAUTH_SECRET set would crash just from the import, breaking
 * Milestone 1's "unit tests are DB/env-independent" design. Every other
 * getEnv() call in this codebase is lazy (inside a function, called at
 * request time); omitting `secret` here keeps this file consistent with
 * that instead of being the one exception.
 */
export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const session = await verifyCredentials(credentials.email, credentials.password);
        if (!session) return null;
        return { id: session.userId, email: session.email, role: session.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = user.id;
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = { id: token.userId, email: session.user.email, role: token.role };
      return session;
    },
  },
};
