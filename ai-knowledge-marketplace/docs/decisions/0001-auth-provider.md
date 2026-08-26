# 0001 — Auth provider selection

**Status:** Decided (Milestone 3) — Auth.js, implemented via `next-auth@4` (stable).

## Decision

Use Auth.js (the `next-auth` package) with a Credentials provider
(email + password) and JWT sessions. No database session adapter — the
`users` table Milestone 2 defined doesn't match the shape NextAuth's
official Postgres adapter expects, and a JWT strategy needs none of it.

## v4 stable, not v5 beta

Auth.js's current major version (branded "Auth.js", exposing the
`auth()`/`signIn()`/`signOut()` server-callable API) has been on the
`next-auth@5.0.0-beta.*` npm tag for a long time with no stable release.
For security-critical infrastructure, an unreleased beta is a real risk
to take on. This project uses `next-auth@4.24.x` (the `latest` npm tag)
instead, which fully supports the Next.js App Router via
`app/api/auth/[...nextauth]/route.ts` and `next-auth/jwt`'s
`getToken`/`encode`/`decode`. Revisit once v5 ships a stable release —
the migration surface is contained to `lib/auth/next-auth-options.ts`
and `lib/auth/session.ts`'s `NextAuthProvider`, per Milestone 1's
`AuthProvider` abstraction.

## Why the spec's literal `/api/auth/login` / `/api/auth/logout` aren't custom routes

The source spec (Engineering Spec Section 9) lists:

```
POST /api/auth/signup
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

`next-auth@4` has no server-callable `signIn()`/`signOut()` (that arrived
in v5) — only its own conventional, CSRF-protected endpoints reached via
the browser-side `next-auth/react` helpers:

| Spec's literal path | What actually handles it |
|---|---|
| `POST /api/auth/signup` | Custom route: `app/api/auth/signup/route.ts` |
| `POST /api/auth/login` | NextAuth's own `POST /api/auth/callback/credentials` (reached via `signIn("credentials", …)` from `next-auth/react` once a frontend exists) |
| `POST /api/auth/logout` | NextAuth's own `POST /api/auth/signout` (reached via `signOut()` from `next-auth/react`) |
| `GET /api/auth/me` | Custom route: `app/api/auth/me/route.ts`, wraps `getSession()` |

Hand-rolling cookie-setting to force the exact `/login`/`/logout` path
strings would mean reimplementing NextAuth's CSRF and cookie-signing
logic ourselves — fighting the framework for a URL string, not a
functional difference. Any future frontend milestone (creator/buyer
sign-in UI) should use `next-auth/react`'s `signIn`/`signOut`, which
target the correct paths automatically; nothing else needs to know about
this mapping.

## What Milestone 3 does NOT cover

- OAuth/social login (spec mentions "Email/social login" as a Must-Have,
  but only email/password is built here — social providers are additive
  later, same Credentials-provider pattern doesn't need to change).
- Admin account creation (`app/api/auth/signup` only accepts
  `creator`/`buyer` — an admin account can never be created through
  public signup; provisioning one is a manual DB operation until an
  admin-invite flow exists).
- Password reset / email verification (not in this milestone's scope;
  flag before this goes to real users).
- Fine-grained resource-ownership authorization — that's Milestone 4
  (Role/permission system), building on `requireRole`/`requireSession`
  from Milestone 1.
