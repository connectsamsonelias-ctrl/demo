# AI Knowledge Licensing Platform — Repository Foundation

This covers **Milestones 1–8**: application skeleton, full core data
model, authentication, the role/permission system, the creator profile,
content submission, the AI Knowledge Audit, and the creator dashboard —
including the minimum browser-reachable UI (sign up/in, profile edit,
content submission) needed to actually demo that flow. No marketplace,
payments, licensing workflow, or buyer onboarding is implemented yet.
See `../docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` (repo root) for the
full product/technical review and roadmap.

## Stack

Next.js 14 (App Router) · TypeScript (strict) · Tailwind CSS · PostgreSQL
(via `pg`, no ORM) · Zod · Vitest · next-auth v4 (Auth.js, credentials +
JWT sessions).

## What's here

```
app/
  page.tsx                Home — links into the flow below (not the real P01 landing page)
  signin/, signup/          Client-component forms (Milestone 8)
  creator/profile/edit/      Client-component form (Milestone 8 — profile UI gap from M5)
  creator/content/new/        Client-component form (Milestone 8 — content UI gap from M6)
  creator/dashboard/           Server Component (Milestone 8) — real content+audit data via
                              direct lib calls; licenses/requests/earnings are honest
                              placeholders (those domains don't exist yet)
  api/health/            DB connectivity sanity check only
  api/auth/[...nextauth]/ NextAuth's own endpoints (csrf, callback/credentials,
                         signout, session, providers)
  api/auth/signup/        Custom: creates a creator/buyer account
  api/auth/me/            Custom: returns the current session or 401
  api/creator/profile/    GET/PATCH — creator's own profile (create-or-update)
  api/creator/content/    GET/POST — list/submit content; [id]/ GET/PATCH one item
  api/creator/content/[id]/audit/  GET/POST — request/check the Knowledge Audit
lib/
  env.ts                 Validated, typed environment variable access
  db/pool.ts               Postgres connection pool + query/withTransaction
  db/types.ts               Hand-written row types mirroring db/migrations/*.sql
  creator/profile.ts        creatorProfileSchema, getCreatorProfile, upsertCreatorProfile
  creator/content.ts         contentSubmissionSchema/contentUpdateSchema,
                            createContentItem, list/get/updateContentItem
  creator/audit.ts           requestAudit / getLatestAudit (enqueues jobs, never calls AI inline)
  ai/
    types.ts                  KnowledgeAuditResult schema, qualityScoreFrom
    prompt.ts                  System/user prompt builders (Tier 1: metadata only)
    provider.ts                 AIAuditProvider interface, env-driven default resolution
    anthropic-provider.ts        Real Claude Haiku 4.5 integration (client injected for testability)
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
  rights/ payments/ search/   Reserved, not implemented (see each README)
middleware.ts             Rate-limits POST /api/auth/* by IP
workers/audit/
  processor.ts               processNextAuditJob() — claims one queued job (FOR UPDATE
                            SKIP LOCKED), calls the AI provider, writes knowledge_assets
  run.ts                      `npm run worker:audit` — polling loop over processor.ts
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
| `npm run worker:audit` | Poll and process queued Knowledge Audit jobs (needs `ANTHROPIC_API_KEY` to succeed; runs fine without it, jobs just fail closed) |

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

## Creator profile (Milestone 5)

- **`GET`/`PATCH /api/creator/profile`**, matching the spec's C02 screen.
  `PATCH` is create-or-update (the spec has no separate `POST`) — the
  first call after signup creates the row, later calls update it. Two
  explicit code paths (`lib/creator/profile.ts`), not an `ON CONFLICT`
  one-liner: a single query can't cleanly express "default this on
  insert, but keep the existing value on update" for a `NOT NULL` JSONB
  column with a default.
- **`verification_status` is structurally impossible to set here** — it
  isn't a field on `creatorProfileSchema` at all, so a client-supplied
  value in the request body is silently dropped by zod, not merely
  rejected. Verified live: a `PATCH` with `verification_status:
  "verified"` in the body returns 200 with the profile still
  `"unverified"`.
- **A small schema gap found while implementing this:** the spec's C02
  screen lists a "Links" field that migration 004's `creator_profiles`
  table had no column for. Added via migration 014
  (`links JSONB NOT NULL DEFAULT '[]'`) rather than overloading
  `expertise`.
- `GET` before a profile exists returns 404 (not an empty object) — the
  distinction matters for a future frontend deciding whether to show a
  "create your profile" flow vs. an edit form.

## Content submission (Milestone 6)

- **`GET`/`POST /api/creator/content`** (list / submit) and
  **`GET`/`PATCH /api/creator/content/:id`** (single item), matching the
  spec's C03 screen. `POST` requires `ownershipAttested: true` — a
  missing field or an explicit `false` both fail validation with a
  specific error message, not just "invalid input."
- **The attestation is MVP-scope: a simple required checkbox**, per an
  explicit decision (platform-level ownership verification via YouTube
  OAuth was considered and deferred — real scope growth for later, not
  this milestone). What's captured is immutable: the exact wording shown
  (`ownership_attestation_text`) and a timestamp, on the row itself —
  same pattern as `licenses.terms_snapshot`, so if the wording changes
  later, historical submissions still show what was actually agreed to.
  **Legal has not reviewed this copy** — flagged the same way the
  original kickoff review flagged consent language generally.
- **What submission does *not* decide:** a new item lands at
  `rights_status = 'SUBMITTED'`, not further along the state machine.
  Whether the attestation itself should auto-advance to
  `AUTHORIZATION_PENDING`/`AUTHORIZED_FOR_PROCESSING` is deliberately left
  to Milestone 13 (Rights management) rather than guessed at here —
  inventing that mapping now would be inventing legal-state semantics
  ahead of the milestone that owns them.
- **`PATCH` cannot change `sourceUrl`, the attestation, `rights_status`,
  or the moderation `status`** — none of those fields exist on
  `contentUpdateSchema` at all, so they're silently dropped, not merely
  rejected. Verified live: a `PATCH` body containing
  `rights_status: "ACTIVE"` and a replacement `sourceUrl` returns 200
  with both fields unchanged.
- **A malformed `:id` (not a UUID) returns 404, not a 500** — validated
  before it ever reaches Postgres, which would otherwise reject it with
  an "invalid input syntax" error.
- **A schema fixture bug this milestone caught:** adding the two new
  `NOT NULL` attestation columns broke two *earlier* milestones' raw-SQL
  test fixtures (`schema.test.ts`, `ownership.test.ts`) that inserted
  `content_items` rows directly. Fixed by updating those fixtures — a
  reminder that a schema change can break tests outside the migration
  that made it, and integration tests are what catch that immediately
  rather than at the next unrelated milestone.

## AI Knowledge Audit (Milestone 7)

- **`POST`/`GET /api/creator/content/:id/audit`**, matching the spec's
  C04 screen and API list. `POST` never calls the AI provider inline —
  it only inserts a `content_processing_jobs` row and returns `202`
  immediately (verified live at ~900ms, dominated by Next.js dev-mode
  compile time, not the AI call — the AI call structurally cannot block
  this response, the code path never awaits it). The actual work happens
  in `workers/audit/processor.ts`, run via `npm run worker:audit`.
- **Scope decision: Tier 1 (metadata) only, not Tier 2 (transcript).**
  The spec's full pipeline assumes a fetched video transcript, but that
  depends on the still-unresolved YouTube ingestion method decision
  (flagged in Milestone 1, never confirmed). The audit prompt is
  explicit with the model that it only has creator-supplied title/
  description/category/language, not the actual content, and is
  instructed to score `depth`/`completeness`/`consistency`
  conservatively as a result — verified by a unit test asserting the
  system prompt actually contains that disclaimer.
- **Model: Claude Haiku 4.5**, chosen for cost — this is a free,
  unauthenticated-cost, high-volume acquisition feature, not a paid
  path. See the kickoff conversation for the cost comparison against
  Sonnet/Opus (~₹0.60/audit at Haiku pricing).
- **No `ANTHROPIC_API_KEY` exists in this dev/build environment.** The
  real integration is fully built and unit-tested (JSON parsing, schema
  validation, error messages) against an injected fake client — but the
  one hop this environment genuinely could not exercise is an actual
  authenticated call to Anthropic. Network reachability to
  `api.anthropic.com` was confirmed (401 without a key, not a connection
  failure). What *was* verified live end-to-end, including through the
  real `npm run worker:audit` CLI (not just the test suite): a job
  enqueued via the real HTTP API, picked up by the real worker process,
  and correctly failing closed after 3 attempts with a clear
  `error_message` — because `NotConfiguredAIProvider` refuses to
  fabricate a plausible-looking audit rather than silently inventing
  data when unconfigured. Once a real key is set, the exact same code
  path runs `AnthropicAuditProvider` instead — nothing else changes.
- **Async job architecture:** `content_processing_jobs` claiming uses
  `SELECT ... FOR UPDATE SKIP LOCKED`, released before the slow external
  AI call (not held for its duration) so multiple worker instances can't
  double-process a job but also don't block each other on unrelated
  jobs. Retries up to 3 attempts, then `status = 'failed'` with the
  error recorded — verified by an integration test driving a job through
  all three attempts to the failure state, not just the first failure.
- **A schema gap found here, same pattern as prior milestones:**
  `content_processing_jobs` had no `created_at`/`queued_at`, and its
  `id` is a random (non-time-ordered) UUID, so "the latest job for this
  content item" had no reliable sort column — status=`queued` jobs also
  have a `NULL started_at`. Fixed via migration 016 (`queued_at`).
- **Provenance is honest about what actually ran:** `AIAuditProvider`
  now exposes a `modelId` the worker records into
  `knowledge_assets.provenance`, rather than a hardcoded model-name
  string that would have silently lied whenever a stub or different
  provider actually ran (caught and fixed while writing this, before it
  shipped).
- **Duplicate-request idempotency:** requesting an audit while one is
  already queued/running returns the existing job rather than enqueuing
  a second one — avoids piling up redundant paid API calls if a creator
  double-clicks. Verified live and in an integration test.
- Deliberately **not implemented here**: any change to `rights_status`
  as a result of the audit completing. The spec's state machine has
  `ANALYSIS_COMPLETE` as a named state, but jumping there from
  `SUBMITTED` would skip the two `AUTHORIZATION_*` states this project
  has deliberately left undefined pending Milestone 13 (Rights
  management) — same reasoning as Milestone 6's stance on the
  attestation. The audit result and the rights state machine are kept
  orthogonal for now.

## Creator dashboard + browser-reachable UI (Milestone 8)

Before this milestone, nothing built in Milestones 1–7 could actually be
clicked through in a browser — Milestone 3 (Authentication) and
Milestone 6 (Content submission) were deliberately API-only per their
scope. Since you asked to keep moving toward a demo, this milestone adds
the minimum UI to make the existing backend reachable, not a designed
product:

- **`/signin`, `/signup`** — plain forms. Sign-in uses `next-auth/react`'s
  `signIn("credentials", …)` client helper, which is exactly the path
  Milestone 3 designed the login flow around (see
  `docs/decisions/0001-auth-provider.md`).
- **`/creator/profile/edit`, `/creator/content/new`** — fill UI gaps
  left by Milestones 5 and 6, which only built the API.
- **`/creator/dashboard`** (Screen C06) — a Server Component, not a
  client-fetched page: it calls `getCreatorProfile`/
  `listContentItemsForCreator`/`getLatestAudit` directly (no HTTP
  round-trip to its own API) and bakes real data into the server-rendered
  HTML. Verified by fetching the raw HTML with `curl`, not just hitting
  the JSON API — confirmed the audit's live failure message
  ("No AI provider is configured…") renders correctly in the page, and
  that a second creator's dashboard shows zero matches for the first
  creator's content title.
- **Active licenses / Requests / Earnings are placeholder cards**, not
  fabricated data — those domains (Milestones 12, 14, 16) don't exist
  yet, and showing a fake "0 licenses" would misrepresent what's
  actually been built.
- **A real regression caught by re-running the existing test suite:**
  adding `getPageSession()` (`lib/auth/session.ts`) pulled in
  `next-auth-options.ts`, whose `authOptions` object called
  `getEnv().NEXTAUTH_SECRET` directly inside the object literal —
  evaluated at *module load*, not request time. Since `session.ts` is
  imported by `lib/auth/authorize.ts`, this silently broke Milestone 1's
  "unit tests are DB/env-independent" guarantee: `authorize.test.ts`
  started crashing on import alone, in an environment with no
  `DATABASE_URL`/`NEXTAUTH_SECRET` set — exactly the environment unit
  tests are supposed to run in. Fixed by removing the explicit `secret:`
  field entirely; NextAuth reads `process.env.NEXTAUTH_SECRET` itself
  when it's omitted, keeping this file consistent with every other
  `getEnv()` call in the codebase (all lazy, inside a function, at
  request time).
- **YouTube ingestion remains explicitly deferred**, per your decision —
  the content-submission form's copy says outright that the audit runs
  against submitted details, not the actual video, so this isn't a
  silent limitation.
- Known minor gap, not fixed here: the ownership-attestation checkbox
  label in `/creator/content/new` is a hand-copied duplicate of
  `OWNERSHIP_ATTESTATION_TEXT` in `lib/creator/content.ts` (the backend
  always records its own canonical string regardless of the frontend's
  wording, so this isn't a correctness bug, but the two could drift out
  of sync if either is edited alone).

## Data model (Milestone 2)

All tables from `docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md` Section 4
are in `db/migrations/004`–`011` (plus `014` adding `creator_profiles.links`
in Milestone 5, and `015` adding the content-item ownership attestation
columns in Milestone 6). Notable decisions made while
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
- **No background-job runner in Milestone 1** — `workers/` existed only
  as a placeholder there; the real polling worker was built in
  Milestone 7 (`workers/audit/`).

## Manual configuration required

- A running PostgreSQL database and its `DATABASE_URL`.
- `NEXTAUTH_SECRET` — generate with `openssl rand -base64 32`.
- `ANTHROPIC_API_KEY` — optional; the app and every other feature run
  fine without it. Only `npm run worker:audit` needs it, and without it
  audit jobs fail closed (status `failed`, a clear `error_message`) —
  they never fabricate a fake result.
- Everything else in `.env.example` is commented out — those are for
  later milestones (object storage, payments) once those business
  decisions are made.

## Verification status

All of the following were actually run against this exact code (not just
reviewed): `npm install`, `npm run typecheck`, `npm run lint`, `npm test`
(62/62 unit tests passing), `npm run build`. Against a real local
PostgreSQL 16 instance: `npm run migrate` (all 16 migrations applied,
forward-migrating cleanly from prior milestones' state; idempotent on a
second run), `npm run test:integration` (44/44 passing — schema
constraints, credentials, ownership, creator-profile, content-submission,
and the new audit layer: job creation, request idempotency,
cross-creator rejection, successful processing with a stub AI provider,
metadata passed through unmodified, the full retry-to-failure lifecycle
across 3 attempts, `content.audit_completed` audit-log entries, and no
`knowledge_assets` row ever written on a failed run).

**One real limitation, stated plainly rather than worked around:** this
environment has no `ANTHROPIC_API_KEY`, so the actual authenticated call
to Anthropic could not be exercised — network reachability to
`api.anthropic.com` was confirmed (401 without a key, not a connection
failure), and the request/response handling (JSON parsing, schema
validation, error messages) is fully unit-tested against an injected
fake client, but a real response was never observed. Everything *around*
that one hop was verified live end-to-end, including through the actual
`npm run worker:audit` CLI (not just the test suite, and not a
reimplementation of it): a job enqueued via `POST` returned in ~900ms
(dominated by dev-server compile time, not the AI call — the code path
structurally never awaits it), correctly stayed `queued` before the
worker ran, and after three real worker iterations correctly reached
`status: "failed"` with a clear `error_message` and no fabricated
`result` — because `NotConfiguredAIProvider` refuses to invent a
plausible-looking audit. Also verified live: re-`POST`ing while a job is
already queued returns the same job (no duplicate), and a second signed-
up creator gets 404 (not 403) on both `GET` and `POST` against another
creator's audit. Test data created by these live calls was deleted from
the dev database afterward.

Milestone 3's live verification additionally covered the full auth
lifecycle (signup, NextAuth CSRF+login, session cookie, wrong-password
rejection, duplicate-email rejection, signout, and the rate limiter
triggering a live 429) — see commit history for that detailed walkthrough.

**Milestone 8 specifically:** `npm run typecheck`/`lint`/`test`
(62/62 — after fixing the eager-`getEnv()` regression described above),
`npm run test:integration` (44/44, unchanged — this milestone added no
schema and no new domain logic), and `npm run build` all pass with the
five new pages compiled in. Live-verified by fetching real server-
rendered HTML with `curl` through the entire flow: unauthenticated
`/creator/dashboard` → `307` to `/signin`; signed in with no profile →
"complete your profile" prompt renders; profile completed, no content →
"No content submitted yet." renders; content submitted → the title and
a "Run Knowledge Audit" button render; audit requested → the page shows
"Audit queued (attempt 0)…"; after running the real `npm run
worker:audit` CLI to exhaustion → the page shows "Audit failed:" with
the actual `error_message` in red; `/signup` and `/signin` render real
forms; and a second creator's dashboard shows zero occurrences of the
first creator's content title. Test data from these live calls was
deleted from the dev database afterward.
