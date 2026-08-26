# AI Knowledge Licensing Platform — Repository Foundation

This is **Milestone 1** of the AI Knowledge Licensing Platform. It
establishes the application skeleton only — no marketplace, payments, AI
processing, licensing, or creator/buyer onboarding is implemented yet.
See `../docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` (repo root) for the
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
  auth/                Role model, session/auth-provider abstraction,
                       server-side authorize() guard
  errors.ts             Typed AppError hierarchy → consistent API error responses
  validation/           Zod wrapper (parseOrThrow)
  audit/log.ts          Audit-log write helper (writes to audit_logs table)
  rights/ payments/ ai/ search/   Reserved, not implemented (see each README)
workers/               Reserved for background job workers (not implemented)
db/
  migrations/           Plain-SQL migrations + a minimal runner (no ORM)
  schema/ seeds/         Reserved for later milestones
tests/
  unit/                 Vitest unit tests for the above
  integration/ e2e/      Reserved for later milestones
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
| `npm test` | Run unit tests once |
| `npm run test:watch` | Run unit tests in watch mode |
| `npm run migrate` | Apply pending SQL migrations |

## Design choices made in this milestone

- **No ORM.** Raw `pg` + hand-written SQL migrations, per the project's
  "prefer simple, boring, reliable systems" principle. Revisit only if
  this becomes a real maintenance burden.
- **Auth is an interface, not a real provider yet.** `DevStubAuthProvider`
  reads a session from a request header and refuses to run outside
  development/test. See `docs/decisions/0001-auth-provider.md` — the real
  provider is an open decision, gating Milestone 3.
- **`audit_logs` and `users` are the only tables created here.** The rest
  of the schema (content items, licenses, transactions, etc.) is
  Milestone 2's scope. `audit_logs` exists early because the
  audit-logging abstraction is a required Milestone 1 deliverable.
- **No background-job runner yet.** `workers/` exists as a placeholder;
  the `content_processing_jobs` table and a polling worker land starting
  Milestone 7.

## Manual configuration required

- A running PostgreSQL database and its `DATABASE_URL`.
- Everything else in `.env.example` is commented out — those are for
  later milestones (object storage, payments, AI provider) once those
  business decisions are made.

## Verification status

All of the following were actually run against this exact code (not just
reviewed): `npm install`, `npm run typecheck`, `npm run lint`, `npm test`
(12/12 passing), `npm run build`, `npm run migrate` against a real local
PostgreSQL 16 instance (verified idempotent — a second run correctly
skips already-applied migrations), and a live `npm run dev` server with
`GET /api/health` returning `{"status":"ok"}` from a real DB round trip.
