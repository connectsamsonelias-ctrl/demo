# AI Knowledge Licensing Platform — Repository Foundation

This covers **Milestones 1–2** of the AI Knowledge Licensing Platform:
application skeleton + full core data model. No marketplace, payments, AI
processing, licensing workflow, or creator/buyer onboarding *routes/UI*
are implemented yet — Milestone 2 is schema only. See
`../docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` (repo root) for the
full product/technical review and roadmap.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · PostgreSQL
(via `pg`, no ORM) · Zod · Vitest.

## What's here

```
app/                  App Router shell: layout, home page, error boundary,
                       /api/health (DB connectivity sanity check only)
lib/
  env.ts              Validated, typed environment variable access
  db/pool.ts           Postgres connection pool + query/withTransaction helpers
  db/types.ts           Hand-written row types mirroring db/migrations/*.sql
  auth/                Role model, session/auth-provider abstraction,
                       server-side authorize() guard
  errors.ts             Typed AppError hierarchy → consistent API error responses
  validation/           Zod wrapper (parseOrThrow)
  audit/log.ts          Audit-log write helper (writes to audit_logs table)
  rights/ payments/ ai/ search/   Reserved, not implemented (see each README)
workers/               Reserved for background job workers (not implemented)
db/
  migrations/           Plain-SQL migrations + a minimal runner (no ORM) —
                       the full data model: users, creator/buyer profiles,
                       content_items, knowledge_assets, licensing_terms,
                       access_requests, licenses, transactions, audit_logs,
                       content_processing_jobs
  schema/ seeds/         Reserved for later milestones
tests/
  unit/                 Vitest unit tests, DB-independent (`npm test`)
  integration/           Vitest tests against a real Postgres
                       (`npm run test:integration`, after `npm run migrate`)
  e2e/                   Reserved for later milestones
docs/decisions/         Open architecture/business decisions log
```

## Setup

Requires Node.js 20+ and a PostgreSQL instance.

```bash
cp .env.example .env.local   # set DATABASE_URL
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

## Data model (Milestone 2)

All tables from `docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` Section 4
are now in `db/migrations/004`–`011`. Notable decisions made while
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
- **Auth is an interface, not a real provider yet.** `DevStubAuthProvider`
  reads a session from a request header and refuses to run outside
  development/test. See `docs/decisions/0001-auth-provider.md` — the real
  provider is an open decision, gating Milestone 3.
- **No background-job runner yet.** `workers/` exists as a placeholder;
  a polling worker over `content_processing_jobs` lands starting
  Milestone 7.

## Manual configuration required

- A running PostgreSQL database and its `DATABASE_URL`.
- Everything else in `.env.example` is commented out — those are for
  later milestones (object storage, payments, AI provider) once those
  business decisions are made.

## Verification status

All of the following were actually run against this exact code (not just
reviewed): `npm install`, `npm run typecheck`, `npm run lint`, `npm test`
(12/12 unit tests passing), `npm run build`. Against a real local
PostgreSQL 16 instance: `npm run migrate` (all 11 migrations applied,
including forward-migrating from Milestone 1's existing `users`/
`audit_logs` tables; a second run correctly skipped everything —
idempotency verified), `npm run test:integration` (7/7 passing, covering
cascade-on-delete, both financial CHECK constraints, the RESTRICT-not-
CASCADE license backstop, the unique payment-reference index, and the
`updated_at` trigger), and a live `npm run dev` server with
`GET /api/health` returning `{"status":"ok"}` from a real DB round trip.
