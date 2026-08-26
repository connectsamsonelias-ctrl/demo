# AI Knowledge Licensing Platform — Repository Foundation

This covers **Milestones 1–4**: application skeleton, full core data
model, authentication, and the role/permission system. No marketplace,
payments, AI processing, licensing workflow, or creator/buyer onboarding
*UI* is implemented yet.
See `../docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` (repo root) for the
full product/technical review and roadmap.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · PostgreSQL
(via `pg`, no ORM) · Zod · Vitest · next-auth v4 (Auth.js, credentials +
JWT sessions).

## What's here

```
app/
  api/health/            DB connectivity sanity check only
  api/auth/[...nextauth]/ NextAuth's own endpoints (csrf, callback/credentials,
                         signout, session, providers)
  api/auth/signup/        Custom: creates a creator/buyer account
  api/auth/me/            Custom: returns the current session or 401
lib/
  env.ts                 Validated, typed environment variable access
  db/pool.ts               Postgres connection pool + query/withTransaction
  db/types.ts               Hand-written row types mirroring db/migrations/*.sql
  auth/
    roles.ts                 Role model (creator/buyer/admin — "visitor" excluded)
    session.ts                AuthProvider interface + NextAuthProvider (default)
                             + DevStubAuthProvider (tests/local convenience)
    authorize.ts               Server-side requireRole()/requireSession() guards
    permissions.ts               can(role, action) — declarative capability matrix
    ownership.ts                 assertOwns*() — per-row ownership checks (DB-backed)
    password.ts                 scrypt hash/verify (no bcrypt dependency)
    credentials.ts               createUserWithPassword / verifyCredentials
    next-auth-options.ts          NextAuth config (Credentials provider, JWT)
  errors.ts               Typed AppError hierarchy → consistent API error responses
  validation/               Zod wrapper (parseOrThrow)
  audit/log.ts               Audit-log write helper (writes to audit_logs table)
  rate-limit.ts              In-memory fixed-window limiter (single-instance only)
  rights/ payments/ ai/ search/   Reserved, not implemented (see each README)
middleware.ts             Rate-limits POST /api/auth/* by IP
workers/                 Reserved for background job workers (not implemented)
db/
  migrations/               Plain-SQL migrations + a minimal runner (no ORM)
  schema/ seeds/             Reserved for later milestones
tests/
  unit/                     Vitest unit tests, DB-independent (`npm test`)
  integration/               Vitest tests against a real Postgres
                            (`npm run test:integration`, after `npm run migrate`)
  e2e/                       Reserved for later milestones
docs/decisions/            Open architecture/business decisions log
```

## Setup

Requires Node.js 20+ and a PostgreSQL instance.

```bash
cp .env.example .env.local   # set DATABASE_URL and NEXTAUTH_SECRET
npm install
npm run migrate              # applies db/migrations/*.sql
npm run dev                  # http://localhost:3000
```

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint (`next/core-web-vitals`) |
| `npm test` | Run unit tests once (no DB required) |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run test:integration` | Run schema/DB tests (requires `DATABASE_URL` + migrations applied) |
| `npm run migrate` | Apply pending SQL migrations |

## Authentication (Milestone 3)

- **Auth.js via `next-auth@4` (stable), not the v5 beta.** See
  `docs/decisions/0001-auth-provider.md` for the full reasoning, including
  why the spec's literal `POST /api/auth/login` / `POST /api/auth/logout`
  map onto NextAuth's own `POST /api/auth/callback/credentials` and
  `POST /api/auth/signout` rather than custom routes (v4 has no
  server-callable `signIn()`/`signOut()` — that's v5-only).
- **`POST /api/auth/signup`** accepts only `role: "creator" | "buyer"` —
  an admin account can never be created through public signup.
- **`GET /api/auth/me`** wraps the session abstraction from Milestone 1
  (`lib/auth/session.ts`) — proving that design choice paid off:
  `NextAuthProvider` now implements the same `AuthProvider` interface
  `DevStubAuthProvider` did, and nothing in `lib/auth/authorize.ts` or its
  callers had to change.
- **Passwords:** Node's built-in `scrypt`, salted, constant-time compared.
- **Failure responses are deliberately uninformative:** wrong password,
  unknown email, and a suspended account all produce the same result
  (null / generic `CredentialsSignin`), so a caller can't enumerate which
  emails have accounts or which are suspended.
- **Rate limiting:** all `POST /api/auth/*` requests are limited to 10/min
  per IP via `middleware.ts` — in-memory, so it only protects a single
  running instance; revisit with a shared store before multi-instance
  deployment.

## Role/permission system (Milestone 4)

Two layers, deliberately separate:

- **`can(role, action)`** (`lib/auth/permissions.ts`) — a declarative
  matrix mirroring the spec's Section 4 role capabilities. Answers
  "could a creator ever do this", nothing more. A unit test asserts
  every declared action is granted to at least one role, to catch a
  typo'd action name silently granting nobody access.
- **`assertOwns*()`** (`lib/auth/ownership.ts`) — per-row, DB-backed
  ownership checks: does *this* content item / access request / license
  belong to *this* signed-in user. Milestone 1's `requireRole` only
  checks account type — without this layer, any creator could edit any
  other creator's content, since nothing checked *which* creator's row
  it was.
- **Ownership failures raise `NotFoundError` (404), not
  `ForbiddenError` (403).** A 403 on someone else's private resource
  confirms it exists; a 404 doesn't — same enumeration-avoidance
  reasoning as `verifyCredentials()` in Milestone 3. Verified by
  integration tests actually asserting the exception type, not just
  that *some* error is thrown.
- No routes call these yet — there's no content/license data for a
  route to guard until Milestone 6+. This milestone is the library
  future route handlers will call; it's exercised directly by
  integration tests that create real rows (two creators, two buyers, a
  license) and confirm each owns only what they created.

## Data model (Milestone 2)

All tables from `docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` Section 4
are in `db/migrations/004`–`012`. Notable decisions made while
translating the spec into an actual schema (none of these were pinned
down explicitly in the source documents):

- **`creator_id`/`buyer_id` on domain tables reference `creator_profiles`/
  `buyer_profiles`, not `users` directly.** Content, licenses and access
  requests belong to the *profile* entity.
- **Two independent status columns on `content_items`:** `status`
  (admin content-moderation gate: draft/pending_review/approved/rejected/
  suspended — Milestone 18) and `rights_status` (the 12+2-state rights
  machine from the spec — Milestone 13 owns the transition guards; this
  migration only defines the enum values).
- **Financial integrity is enforced by the database, not just app code:**
  `licensing_terms` requires `creator_share_percent + platform_share_percent
  = 100`; `transactions` requires `buyer_amount = platform_fee +
  creator_amount`. Both are verified by integration tests actually
  rejecting a bad insert, not just declared.
- **`licenses.content_item_id/creator_id/buyer_id` are `ON DELETE
  RESTRICT`, not `CASCADE`.** This is the schema-level backstop for the
  spec's rule that a creator withdrawal (or any deletion) must never be
  able to silently destroy an active contractual license — verified by an
  integration test that a delete attempt is actually rejected.
- **`audit_logs.actor_id` is `ON DELETE SET NULL`** (fixed in migration
  013, after Milestone 3's integration tests caught the original
  migration 002 leaving it at the implicit `RESTRICT` — which would have
  made it impossible to ever delete a user once they had any audit log
  entry, including their own signup record). The audit trail must survive
  the actor being removed.
- **`transactions.payment_reference` has a unique partial index** (unique
  when non-null) so a provider webhook can be matched back to exactly one
  transaction, while a not-yet-charged (`pending`) transaction can still
  have no reference.
- **Every table with `updated_at` gets it touched by a shared Postgres
  trigger**, not application code, so it can't be forgotten.
- Enum value choices for `access_request_status`, `license_status`,
  `transaction_status`, `verification_status`, and `processing_job_status`
  are engineering defaults (not specified by the source spec) — each is
  commented in its migration file and flagged as revisitable.

## Design choices made in Milestone 1

- **No ORM.** Raw `pg` + hand-written SQL migrations, per the project's
  "prefer simple, boring, reliable systems" principle. Revisit only if
  this becomes a real maintenance burden.
- **No background-job runner yet.** `workers/` exists as a placeholder;
  a polling worker over `content_processing_jobs` lands starting
  Milestone 7.

## Manual configuration required

- A running PostgreSQL database and its `DATABASE_URL`.
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`.
- Everything else in `.env.example` is commented out — those are for
  later milestones (object storage, payments, AI provider) once those
  business decisions are made.

## Verification status

All of the following were actually run against this exact code (not just
reviewed): `npm install`, `npm run typecheck`, `npm run lint`, `npm test`
(27/27 unit tests passing), `npm run build`. Against a real local
PostgreSQL 16 instance: `npm run migrate` (all 13 migrations applied —
Milestone 4 added no schema changes — forward-migrating cleanly from
prior milestones' state; idempotent on a second run), `npm run
test:integration` (21/21 passing — schema constraints, the credentials
layer, and the new ownership layer: an owning creator/buyer allowed, a
non-owner rejected with `NotFoundError` specifically, a nonexistent
resource likewise, and both legitimate sides of a license allowed while
a third party is rejected).

A live `npm run dev` server was also driven through the full HTTP
lifecycle with `curl`, not just the test suite: signup → NextAuth CSRF +
`POST /api/auth/callback/credentials` login → session cookie issued →
`GET /api/auth/me` returns the session → wrong-password login correctly
rejected → duplicate-email signup correctly rejected with 409 →
`role: "admin"` signup correctly rejected with 422 → `POST
/api/auth/signout` clears the cookie → `GET /api/auth/me` correctly
returns to 401 → and the rate limiter was confirmed live (12 rapid
`POST /api/auth/*` requests, first 10 succeeded, remainder 429). Test
data created by these live curl calls was deleted from the dev database
afterward.
