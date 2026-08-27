# AI Knowledge Licensing Platform — Repository Foundation

This covers **Milestones 1–12**: application skeleton, full core data
model, authentication, the role/permission system, the creator profile,
content submission, the AI Knowledge Audit, the creator dashboard
(including the minimum browser-reachable UI needed to demo that flow),
the public marketplace (browse + asset detail), marketplace search/
filtering (PostgreSQL full-text search, no Elasticsearch), buyer
onboarding (buyer profile + dashboard), and access requests (buyer
request → creator approve/reject). No payments, licensing workflow, or
rights-state-machine transitions beyond the minimal ones already made
are implemented yet.
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
  marketplace/, marketplace/[id]/  Public Server Components (Milestone 9) — no auth
  buyer/profile/edit/          Client-component form (Milestone 11)
  buyer/dashboard/              Server Component — real profile + Requests (Milestone 12);
                              licenses/payments/downloads/saved-assets are honest
                              placeholders (no backing tables/domains yet)
  marketplace/[id]/request-access-form.tsx  Client component (Milestone 12) — Screen B04
  creator/dashboard/request-actions.tsx      Client component (Milestone 12) — approve/reject
  api/health/            DB connectivity sanity check only
  api/auth/[...nextauth]/ NextAuth's own endpoints (csrf, callback/credentials,
                         signout, session, providers)
  api/auth/signup/        Custom: creates a creator/buyer account
  api/auth/me/            Custom: returns the current session or 401
  api/creator/profile/    GET/PATCH — creator's own profile (create-or-update)
  api/creator/content/    GET/POST — list/submit content; [id]/ GET/PATCH one item
  api/creator/content/[id]/audit/  GET/POST — request/check the Knowledge Audit
  api/creator/content/[id]/listing/  POST/DELETE — list/unlist on the marketplace
  api/marketplace/, api/marketplace/[id]/  GET, public — browse/detail;
                            api/marketplace/ accepts q/category/language/topic/skill/
                            minQuality filter query params (Milestone 10)
  api/buyer/profile/    GET/PATCH — buyer's own profile (create-or-update, Milestone 11)
  api/buyer/requests/    GET/POST — list own / submit an access request (Milestone 12)
  api/creator/requests/  GET — list requests for the creator's own content
  api/creator/requests/[id]/approve, /reject/  POST each — resolve a pending request
lib/
  env.ts                 Validated, typed environment variable access
  db/pool.ts               Postgres connection pool + query/withTransaction
  db/types.ts               Hand-written row types mirroring db/migrations/*.sql
  creator/profile.ts        creatorProfileSchema, getCreatorProfile, upsertCreatorProfile
  creator/content.ts         contentSubmissionSchema/contentUpdateSchema,
                            createContentItem, list/get/updateContentItem
  creator/audit.ts           requestAudit / getLatestAudit (enqueues jobs, never calls AI inline)
  creator/listing.ts          listContentOnMarketplace / unlistContentFromMarketplace —
                             the minimal SUBMITTED->LISTED->WITHDRAWN transition (Milestone 9)
  marketplace.ts               Public reads (listMarketplaceItems/getMarketplaceItem) —
                             explicit column lists, never SELECT *, so internal fields
                             (attestation text, creator user_id) can't leak. Filters
                             (Milestone 10) build a parameterized WHERE clause —
                             every value bound, never string-interpolated
  buyer/profile.ts             buyerProfileSchema, getBuyerProfile, upsertBuyerProfile —
                             mirrors creator/profile.ts exactly (Milestone 11); fills a
                             gap in the spec's own API list (no buyer profile endpoint
                             was ever specified, despite Screen B02 needing one)
  buyer/requests.ts             accessRequestSchema, createAccessRequest,
                             listAccessRequestsForBuyer, getOwnAccessRequestForContent
                             (Milestone 12) — only a LISTED item can be requested;
                             a duplicate in-flight request returns the existing row
  creator/requests.ts            listAccessRequestsForCreator, approveAccessRequest,
                             rejectAccessRequest (Milestone 12) — deliberately does
                             NOT touch content_items.rights_status (see below)
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

## Marketplace (Milestone 9)

- **`POST`/`DELETE /api/creator/content/:id/listing`** — a creator opts
  their own content into/out of the public marketplace.
  **`GET /api/marketplace`** and **`GET /api/marketplace/:id`** — public,
  no authentication, matching the spec's "Visitor can browse publicly
  available listings." No search/filters yet — Screen P03 lists
  topic/industry/skill/language/quality/rights-type/license-availability
  filters explicitly, and those are Milestone 10's scope, not this one.
- **The real scope decision here:** content submitted in Milestone 6 sits
  at `rights_status = 'SUBMITTED'` forever — nothing advances it, because
  the full legal state machine (`SUBMITTED` →
  `AUTHORIZATION_PENDING` → `AUTHORIZED_FOR_PROCESSING` →
  `ANALYSIS_COMPLETE` → `LICENSING_ELIGIBLE` → `LISTED`) belongs to
  Milestone 13, and guessing at those intermediate states' legal meaning
  here would be inventing rights semantics ahead of the milestone that
  owns them. Instead, `lib/creator/listing.ts` implements one minimal,
  explicit, clearly-labeled simplification: a creator can move
  `SUBMITTED` directly to `LISTED`, gated on one condition — a completed
  Knowledge Audit must already exist — preserving at least that much of
  the real state machine's intent (`ANALYSIS_COMPLETE` precedes
  `LICENSING_ELIGIBLE` in the spec). Verified live: listing before an
  audit exists correctly 422s with a specific message; listing again
  after already listed also 422s (only one `SUBMITTED → LISTED`
  transition is legal).
- **A real, stated gap, not a silently cut corner:** this does **not**
  check `content_items.status` (the admin content-moderation gate) —
  because nothing can ever set it to `'approved'` yet; Milestone 17
  (Admin) doesn't exist. Anything a creator lists today goes live with
  zero moderation review. This must be closed before real users are
  onboarded, and is flagged here exactly so it isn't forgotten. (Closed
  in Milestone 17 — see that section below.)
- **Unlisting** (`LISTED → WITHDRAWN`) exists for symmetry/demo
  completeness — safe to add now because nothing can be licensed yet
  (Milestone 13's much harder "must not invalidate an active license"
  problem doesn't apply until Milestone 14 ships).
- **Public reads never `SELECT *`.** `lib/marketplace.ts` uses explicit
  column lists so `content_items.ownership_attestation_text` (a
  compliance record) and `creator_profiles.user_id` can never leak into
  a public response — verified by an integration test asserting those
  keys are literally absent from the returned object, not just that the
  visible fields look right.
- **Same enumeration-avoidance pattern as the ownership layer:**
  `getMarketplaceItem()` returns `null` — and the route 404s — for both
  "no such content item" and "exists but isn't listed." A public caller
  can't tell an unlisted item from a nonexistent one. Verified live: a
  real, existing-but-unlisted item 404s on both the API and the page.
- **Provenance is shown honestly on the detail page**: when an audit's
  `input_basis` is `"metadata_only"` (Milestone 7's Tier-1 scope), the
  asset detail page says so directly to the buyer, rather than letting
  the audit read as if it analyzed the actual video.
- Live verification used a directly-inserted `knowledge_assets` row to
  simulate a completed audit, for the same reason Milestone 7's live
  check couldn't exercise a real Anthropic call: no `ANTHROPIC_API_KEY`
  in this environment. Stated plainly, not glossed over.

## Marketplace search/filtering (Milestone 10)

- **PostgreSQL full-text search + indexed filters, no Elasticsearch** —
  per the spec's Section 10 instruction exactly. Migration 017 adds a
  GIN expression index over `to_tsvector('english', title ||
  description)` on `content_items`, plus GIN indexes on
  `knowledge_assets.topics`/`skills` and a btree index on
  `quality_score` (the spec explicitly calls out "indexed quality
  score").
- **Filters implemented, matched against real data:** `q` (full-text),
  `category`, `language`, `topic`/`skill` (JSONB containment against the
  audit's extracted topics/skills), `minQuality`. **Filters explicitly
  NOT implemented**, matched against the spec's P03 list: "Industry" (no
  distinct column exists — `category` already serves this role, adding a
  redundant field with no clear definition of the difference would be
  over-engineering) and "Rights type"/"License availability" (both
  depend on `licensing_terms` data that Milestone 14 hasn't populated
  yet — a filter with no real data behind it would be worse than no
  filter).
- **Query building is careful about injection, not just parameterized by
  accident:** `buildFilterConditions()` in `lib/marketplace.ts`
  constructs the condition list and its parameter array together, in
  lockstep, so a `$N` placeholder and its bound value can never drift
  apart as filters are conditionally added. Verified by an integration
  test passing a SQL-injection-shaped string as `q` — confirmed it's
  treated as a literal search term (no match, no error, `users` table
  unaffected) rather than executed.
- **The filter form is a plain `<form method="get">`** on the Server
  Component page — no client JS required for search/filter to work,
  and the resulting URL is shareable/bookmarkable. Verified live that
  the page pre-fills submitted filter values back into the form inputs.
- **Invalid filter values fail differently depending on the caller:**
  the API (`GET /api/marketplace`) returns a real `422` for e.g.
  `minQuality=150` — verified live. The *page*, by contrast, silently
  drops an invalid filter and falls back to showing unfiltered results,
  since a malformed query string (e.g. a stray bookmarked URL) shouldn't
  break browsing for a human.

## Buyer onboarding (Milestone 11)

- **A real gap found before writing any code:** the spec's Section 9 API
  list has `GET`/`PATCH /api/creator/profile` but no buyer equivalent,
  even though `buyer_profiles` has existed in the schema since
  Milestone 2 and Screen B02 explicitly requires organization/industry/
  use-case fields. Added `GET`/`PATCH /api/buyer/profile`, mirroring
  `lib/creator/profile.ts`'s create-or-update pattern exactly (same
  two-explicit-branches reasoning, same `verification_status`
  exclusion). No schema changes needed — the table was already there.
- **Screen B05 (Buyer dashboard) cards for Requests/Active licenses/
  Payments/Downloads are honest placeholders**, same pattern as the
  creator dashboard (Milestone 8) — those domains (Milestones 12, 14,
  15) don't exist yet. **"Saved assets" specifically has no backing
  table anywhere in the schema** — that would be a new bookmarking
  feature, not buyer onboarding, so it's not being added here either;
  it gets the same placeholder treatment rather than being quietly
  dropped from the screen.
- **Search/browsing needed nothing new for buyers** — the marketplace
  (Milestones 9–10) was already public and unauthenticated, matching the
  spec's own "Visitor can browse" design; a buyer's only addition is the
  profile + dashboard shell around that existing browsing experience.
- Role isolation verified live: a signed-in **creator** hitting
  `/api/buyer/profile` gets `403`, and visiting `/buyer/dashboard`
  redirects to `/` — the same `requireRole`/`getPageSession` guards used
  everywhere else, not new logic written for buyers specifically.

## Access requests (Milestone 12)

- **`POST`/`GET /api/buyer/requests`** (Screen B04) and
  **`GET /api/creator/requests`** + **`POST .../approve`** /
  **`POST .../reject`**, matching the spec's API list exactly — this is
  the milestone where the two sides of the marketplace actually connect
  for the first time.
- **The scope decision flagged before writing any code:** the spec's
  rights state machine names `LICENSE_REQUESTED` directly after
  `LISTED`, but `access_requests` is one-to-many against a content item
  (several buyers can request the same listing) while
  `content_items.rights_status` is a single value per item — advancing
  it here would conflate a 1:many relationship into a 1:1 field, which
  is architecturally wrong, not merely a simplification to flag.
  `rights_status` is left untouched by request creation, approval, *and*
  rejection; the real next transition (to `LICENSED`) belongs to
  Milestone 14, when an actual license is created from an approved
  request. Verified live and by an integration test: approving a
  request leaves `content_items.rights_status` at `'LISTED'`.
- **Only a publicly `LISTED` item can be requested** — checked directly
  against `content_items.rights_status`, not by routing through the
  public `lib/marketplace.ts` read layer (this is an authenticated
  path, not an anonymous one). Requesting access to `SUBMITTED` or
  unlisted content 404s — verified live and in an integration test.
- **Duplicate-request idempotency**, same pattern as Milestone 9's
  listing toggle: re-requesting while a `pending`/`approved` request
  already exists for that buyer+item returns the existing row instead
  of creating a second one. Verified live: submitting a second request
  with different text returns the same request `id`.
- **Approve/reject only accept a `'pending'` request** — resolving an
  already-resolved request returns a `422` with a specific message
  ("only 'pending' requests can be resolved"), not a silent no-op or a
  generic error. Verified live.
- **Ownership is enforced on both sides**, reusing the Milestone 4
  helpers rather than new logic: `assertOwnsContentForAccessRequest`
  gates approve/reject to the content's actual creator (a different
  creator gets `404`, verified live with a real second creator account,
  not just a missing-profile 404), and buyers only ever see their own
  requests (`requireBuyerProfileId` scopes the query).
- **The asset detail page now branches on real session state**: signed
  out → sign-in prompt; signed in as buyer with no profile → "complete
  your profile" prompt; signed in as buyer with a profile and no
  existing request → the request form; already requested → the current
  status. All four states verified live by fetching the actual rendered
  HTML at each stage.
- Pricing and full licensing terms remain an explicit placeholder on the
  asset detail page — that's Milestone 14, and the page says so.

## Rights management (Milestone 13)

- **`lib/rights/state-machine.ts`** is now the single source of truth for
  every `rights_status` transition, encoded as data
  (`RIGHTS_STATUS_TRANSITIONS: Record<RightsStatus, RightsStatus[]>`) plus
  `assertValidRightsTransition(from, to)` / `isValidRightsTransition`. It
  encodes the **complete** graph from the spec, including edges no code
  path can reach yet (Milestone 14 Licensing, 16 Withdrawal, 18 Admin
  territory) — the graph is correct and independently unit-tested now,
  not bolted on when those milestones land.
- **Critical safety property, enforced structurally and covered by a
  dedicated unit test:** there is **no direct `ACTIVE -> WITHDRAWN`
  edge**. The only path out of `ACTIVE` is
  `ACTIVE -> WITHDRAWAL_REQUESTED -> CONTRACTUAL_REVIEW -> WITHDRAWN`.
  This is the code-level enforcement of the kickoff review's stubbed
  legal policy that an existing `ACTIVE` license always survives a
  withdrawal request in v1 — even though no code path can reach `ACTIVE`
  yet, the graph itself cannot express a shortcut around it.
- **Two deliberate, explicitly-documented simplifications**, both
  formalizing decisions already made in earlier milestones rather than
  inventing new ones:
  - `SUBMITTED -> AUTHORIZED_FOR_PROCESSING` skips
    `AUTHORIZATION_PENDING`. Milestone 6 already made ownership
    attestation (`ownershipAttested: true`) a precondition of row
    creation, so there is never a real "pending authorization" window to
    represent honestly. `AUTHORIZATION_PENDING` remains a valid enum
    value (schema completeness) but no code path ever sets it.
  - `AUTHORIZED_FOR_PROCESSING -> LICENSING_ELIGIBLE` skips
    `ANALYSIS_COMPLETE`, for the same reason: no distinguishing
    business/quality gate exists yet between "analysis just finished"
    and "eligible for licensing" at this MVP stage.
- **`createContentItem` now auto-chains the first real transition**:
  after inserting the row at `SUBMITTED` (unchanged from Milestone 6, own
  audit-log entry), it immediately transitions to
  `AUTHORIZED_FOR_PROCESSING` in the same database transaction, through
  the same guard-checked path as every other transition, with its own
  `content.authorized_for_processing` audit-log entry. A newly-submitted
  content item is now at `AUTHORIZED_FOR_PROCESSING`, not `SUBMITTED`,
  by the time the API call returns — verified live and in integration
  tests.
- **`workers/audit/processor.ts` gates on rights_status before calling
  the AI provider**: a literal implementation of spec Section 12's
  "eligibility/authorization check" pipeline step. If a claimed job's
  content item isn't `AUTHORIZED_FOR_PROCESSING` (e.g. it was withdrawn
  after the job was queued), the job fails cleanly through the existing
  retry-to-failure path with a clear `error_message`, instead of running
  an audit for content that isn't authorized to be processed. On success,
  it now also transitions `AUTHORIZED_FOR_PROCESSING -> LICENSING_ELIGIBLE`
  in the same transaction as the `knowledge_assets` insert, with its own
  `content.licensing_eligible` audit-log entry.
- **`lib/creator/listing.ts` refactored to use the centralized guard**:
  the separate "SUBMITTED + has a knowledge_assets row" check from
  Milestone 9 is gone. Listing now requires exactly `rights_status ===
  'LICENSING_ELIGIBLE'` (checked via `assertValidRightsTransition`), and
  unlisting requires `'LISTED'` — both now share the same transition-
  guard code path as every other `rights_status` change in the app, and
  a rejected transition names both states in its error message.
  `hasCompletedAudit()` (an unrelated dashboard read-convenience) is
  untouched.
- **Access requests (Milestone 12) stance reaffirmed, unchanged**:
  `LICENSE_REQUESTED` is a valid graph node (for spec completeness) but
  is never actually occupied by this product — `access_requests` stays a
  separate 1:many table, deliberately not folded into the single-valued
  `rights_status` field. The transition graph documents this in a
  comment rather than silently omitting the edge.
- Deleted the Milestone 1 `lib/rights/README.md` placeholder now that
  real code lives there.

## Licensing (Milestone 14)

- **`lib/licensing/commission.ts`** — the platform's default commission
  split, `DEFAULT_CREATOR_SHARE_PERCENT = 80` /
  `DEFAULT_PLATFORM_SHARE_PERCENT = 20`. The spec explicitly flags "default
  commission split" as a **Business** decision, not an engineering
  default — confirmed with the user before writing any code: 80/20,
  matching the spec's own "illustrative 20%" commission figure. A single
  global constant, not per-creator or per-license-type — "per-license-type
  variance" is a separate, still-open business decision, not resolved
  here.
- **`lib/creator/licensing-terms.ts`** (Screen C05, "opt-in to licensing
  with explicit terms") — a creator sets/updates commercial terms
  (allowed use types, duration, geographic scope, commercial status,
  pricing model, base price) on their content. Full-replace upsert
  (`licensing_terms.content_item_id` is `UNIQUE`), ownership-gated,
  audit-logged (`licensing_terms.create`/`.update`, distinguished).
  `creator_share_percent`/`platform_share_percent` are **not present in
  the input schema at all** — set only from the commission default above,
  never accepted from a request body, per the spec's rule that commission
  must never be client-settable. Verified live and by a schema unit test
  asserting the fields don't even parse through.
- **Approving an access request now creates a real `licenses` row**, not
  just a status flip. `lib/creator/requests.ts`'s `approveAccessRequest`
  (Milestone 12) now also runs `createLicenseForApprovedRequest` in the
  same transaction as the status update: it requires `licensing_terms` to
  already exist for the content item (else `422`, "set licensing terms
  before approving requests" — the smallest-assumption choice: never
  fabricate a `terms_snapshot` for terms nobody set), then inserts a
  `licenses` row with `terms_snapshot` copied from the current
  `licensing_terms` at that instant (per the spec's Section 14 rule:
  never re-derive historical terms from a row that can change later),
  `license_type` fixed at `'standard'` for every V1 license (the spec's
  "per-license-type variance" stays unresolved), and `status` starting at
  `'pending_payment'` (migration 009's own rule: never activate on an
  assumption — only Milestone 15's verified payment webhook does that).
  Rejecting a request creates no license. Verified live and by integration
  tests, including the pre-terms rejection and the exact `terms_snapshot`
  contents.
- **`content_items.rights_status` stays completely untouched by license
  creation** — same reasoning Milestone 12 already established for access
  requests: a content item can have many concurrent licenses to different
  buyers (1:many), so advancing a single-valued `rights_status` to
  `LICENSED`/`ACTIVE` here would re-introduce the exact conflation
  Milestone 12 rejected. `lib/rights/state-machine.ts`'s comments are
  updated to say so explicitly: `LICENSE_REQUESTED`/`LICENSED`/`ACTIVE`
  are now documented as permanent graph-only nodes that this
  implementation has decided will never be triggered, not merely "not yet
  triggered." Verified live: `rights_status` stayed `'LISTED'` through
  approval and license creation.
- **Read-only listing endpoints and dashboard surfacing**:
  `GET /api/creator/licenses`, `GET /api/buyer/licenses`, and both
  dashboards now show a real "Licenses" section (still all
  `pending_payment` until Milestone 15) in place of the old placeholder
  cards. The creator dashboard also links each content item to a new
  `/creator/content/[id]/licensing-terms` form (Screen C05), following
  the same minimal blank-form-that-PATCH-upserts pattern as the existing
  profile-edit pages.
- **Not built in this milestone, deliberately**: buyer-side "accept
  terms" UI (the `license.accept_terms_own` capability already sits
  unused in the Milestone 4 permissions matrix) — the schema has no
  "awaiting acceptance" `license_status` value, and the spec's own
  workflow bullet doesn't describe a separate acceptance step before
  payment, so this is left for Milestone 15 (Payments) to define if it
  turns out to be needed, rather than inventing a status/flow now.

## Payments (Milestone 15)

- **Provider and currency were an explicit business decision, not an
  engineering default** — the spec blocks this outright: "Payment
  provider and supported countries/currencies are unchosen... needs to be
  picked before the Payments milestone. **[BUSINESS DECISION]**".
  Confirmed with the user before writing any code: **Stripe**, and a
  single global currency for V1 (**USD-only**, worldwide) as the smallest
  reasonable MVP scope — not asked separately, but stated explicitly here
  as the assumption in effect, per the "make the smallest reasonable
  assumption and state it" rule. `stripe` (official Node SDK, real types
  verified against the installed package before writing any client code
  — never guessed) is now a dependency.
- **`lib/payments/provider.ts`** — same fail-closed pattern as
  `lib/ai/provider.ts`: `NotConfiguredPaymentProvider` throws rather than
  fabricating a checkout URL or accepting an unverified webhook.
  Deliberately split into two independent capabilities,
  `getCheckoutProvider()` (needs `STRIPE_SECRET_KEY`, makes a real network
  call to Stripe) and `getWebhookVerifier()` (needs only
  `STRIPE_WEBHOOK_SECRET` — `Stripe.webhooks` is a static, key-less HMAC
  check, so a deployment can verify and act on real Stripe-confirmed
  payments without the checkout-creation credential ever being
  configured).
- **`lib/creator/requests.ts` gained no changes this milestone** — the
  `licenses` row and its `pending_payment` status already exist from
  Milestone 14; this milestone only adds what turns `pending_payment`
  into `active`.
- **`lib/buyer/checkout.ts`** (`startCheckoutForLicense`) — buyer-only
  (new `assertOwnsLicenseAsBuyer` in `lib/auth/ownership.ts`, distinct
  from the existing `assertOwnsLicense` which also allows the creator
  side for read access). Requires the license to be the buyer's own and
  still `pending_payment`, and its `terms_snapshot.base_price` to be a
  positive number (a license with no price set has nothing to pay — a
  `422`, not a fabricated $0 checkout). The amount charged is read only
  from the license's own frozen `terms_snapshot`, never from the
  content's *current* `licensing_terms` — same "never retroactively
  recalculate" rule as Milestone 14. `successUrl`/`cancelUrl` are
  computed server-side from the request's own origin, never accepted
  from the client, to avoid an open-redirect vector on a payment flow.
- **`POST /api/webhooks/payments`** — the **only** place a license is
  ever activated, per the spec's explicit rule that payment confirmation
  must never be client-settable and migration 009's own comment ("never
  activate on a client-asserted 'payment succeeded'"). Verifies the
  `Stripe-Signature` header against the raw request body (`request.text()`,
  never `request.json()` — re-serializing the body would break the
  signature) before touching anything; an invalid/missing/unconfigured
  signature is always a `400`, generic on purpose (never describes *why*
  verification failed). On a verified, paid `checkout.session.completed`
  event: creates a `transactions` row (`buyer_amount`/`platform_fee`/
  `creator_amount` computed in integer cents from the license's frozen
  commission split, converted back to `NUMERIC(12,2)` only at the very
  end — never float arithmetic on money) and flips the matching license
  `pending_payment -> active` with `start_date = CURRENT_DATE`, both in
  one transaction with their own audit log entries
  (`transaction.create`/`license.activate`). **Idempotent**: a `FOR
  UPDATE` lock on the license row plus a "still `pending_payment`?"
  re-check means a Stripe-redelivered (or otherwise duplicated) event for
  an already-activated license is a safe no-op — verified live by
  literally replaying the same signed webhook payload. An unrecognized
  license id or a non-`checkout.session.completed`/unpaid event returns
  `{handled: false}` with a `200`, never a `5xx` (a webhook 5xx makes
  Stripe retry indefinitely).
- **`license_duration` is not turned into a computed `end_date`** —
  parsing an arbitrary free-text duration string (e.g. "1 year") into a
  real date is out of scope here; `end_date` stays `null` on activation.
  Flagged as a real gap, not silently resolved.
- **Genuinely tested, not just mocked, unlike the AI provider case**:
  Stripe webhook signing/verification is local HMAC (`Stripe.webhooks` —
  no network call, no live API key needed), so
  `tests/unit/stripe-provider.test.ts` signs real payloads with the
  actual `stripe` SDK and verifies them for real — including a tampered
  body and a wrong secret both correctly throwing. Checkout *creation*
  (a real network call to Stripe) is the one piece this sandbox
  genuinely cannot exercise end-to-end, same limitation as Milestone 7's
  AI provider — verified instead that it fails closed cleanly with no
  `STRIPE_SECRET_KEY` configured.
- **Not built in this milestone, deliberately**: creator payouts
  (transferring `creator_amount` out to the creator) — that's Milestone
  16 (Creator earnings), which reads the `transactions` this milestone
  now creates but doesn't itself move any money to a creator. Refunds
  (`transaction_status = 'refunded'` already exists in the schema) also
  aren't wired to any code path yet.

## Creator earnings (Milestone 16)

- **A read-only earnings ledger, no new schema.** `lib/creator/earnings.ts`
  builds entirely on `transactions` (Milestone 15) joined through
  `licenses.creator_id` — `getEarningsSummaryForCreator` (total earned +
  transaction count, `succeeded` only) and `listEarningsForCreator` (the
  full per-transaction ledger, every status, not just `succeeded` — a
  creator can see pending/failed activity too, not only what cleared).
- **Deliberately does not move any money.** The spec's own item list
  flags real creator payout mechanics — a bank account, Stripe Connect
  account onboarding, KYC, tax forms — as depending on a business/
  compliance decision that was never made (only the *buyer-payment*
  provider was confirmed, in Milestone 15). Inventing a payout/KYC flow
  here would mean guessing at a real compliance surface nobody signed off
  on. This milestone shows a creator what they've earned; actual
  disbursement stays explicitly out of scope, not silently skipped — the
  dashboard says so directly ("This is what you've earned, not a payout
  — bank transfers aren't built yet").
- **A known, explicitly-flagged gap**: `totalEarned` does not subtract
  refunded transactions. No code path sets `transaction_status =
  'refunded'` anywhere yet (noted as unwired in the Milestone 15
  section) — once one exists, this sum needs to exclude/reverse those,
  but that's real future work, not solved here.
- **`GET /api/creator/earnings`** returns both the summary and the full
  ledger in one call; the creator dashboard's old "Earnings" placeholder
  card is now the real summary plus a per-transaction list (content
  title, buyer org, the creator's own share, status).

## Admin dashboard (Milestone 17)

- **Closes a gap flagged since Milestone 9**: the kickoff review's
  "**[LEGAL/OPS — MUST EXIST DAY ONE]**" requirement for a working
  takedown/moderation process, and `lib/creator/listing.ts`'s own
  "Known gap... anything a creator lists today goes live with zero
  moderation review" comment. `listContentOnMarketplace` now requires
  `content_items.status === 'approved'` in addition to the existing
  `rights_status` guard — both gates are independent and both must pass.
  Verified live: listing a rights-eligible item still `422`'d until an
  admin approved it.
- **`lib/admin/content.ts`** — the moderation queue (`pending_review`,
  oldest first) plus `approveContent`/`rejectContent` (from
  `pending_review`) and `suspendContent`/`reinstateContent` (the takedown
  action the spec calls "manual admin action acceptable for v1", between
  `approved` and `suspended`). Suspending content that's currently
  `LISTED` also drives `rights_status LISTED -> SUSPENDED` — an edge
  `lib/rights/state-machine.ts` defined back in Milestone 13 but never
  triggered until now (its comment is corrected accordingly: it had said
  "Milestone 18" throughout, a stale reference from before this session's
  roadmap settled on Admin dashboard = Milestone 17). Reinstating drives
  it back `SUSPENDED -> LISTED`. If the content isn't currently `LISTED`
  (most importantly `ACTIVE`, where a real license exists), there is
  deliberately no valid rights_status edge, so only the moderation status
  changes — an admin content action can never silently kill an active
  license, same invariant as the ACTIVE/WITHDRAWN safety property.
  Verified live end to end: suspending a listed item removed it from
  `GET /api/marketplace` immediately; reinstating brought it back.
- **`lib/admin/users.ts`** — `listUsersForReview` (no password hashes
  selected, ever) and `suspendUser`/`reinstateUser` (`users.status`,
  which `verifyCredentials` already checks — a suspended account is
  immediately blocked from signing in, not just hidden from some UI).
  Suspending an admin account through this action is refused outright,
  to avoid an admin locking out themselves or another admin. Deliberately
  does **not** cascade to the user's own content (e.g. auto-unlisting
  everything they own) — that's real future work if needed, not invented
  here; `lib/admin/content.ts`'s actions stay separate and explicit.
  Verified live: a real creator account, suspended via the API, was then
  rejected on a real sign-in attempt with the exact same generic
  `CredentialsSignin` error Milestone 3 already uses for any failed
  login (no distinguishable "this account is suspended" message — same
  enumeration-avoidance reasoning as everywhere else in this app).
- **`lib/auth/admin.ts`** — a small `requireAdmin(session)` defense-in-
  depth check every `lib/admin/*` function calls, on top of (never
  instead of) the route-level `requireRole(request, ["admin"])` every
  other role-gated route already uses.
- **`/admin/dashboard`** — same protected-page pattern as the creator/
  buyer dashboards (redirect to `/signin` if signed out, to `/` if signed
  in as the wrong role). Shows the real moderation queue and user list,
  with Approve/Reject/Suspend/Reinstate actions.
- **Admin account provisioning stays exactly as decided in Milestone 3**:
  `PUBLIC_SIGNUP_ROLES` in `lib/auth/credentials.ts` already excluded
  `admin` from public signup, with a comment noting manual DB
  provisioning for now. This milestone doesn't change that — the admin
  account used for live verification was seeded directly via the app's
  own `hashPassword()` (a real, correctly-hashed password, not a
  shortcut), not through any new provisioning flow.
- **Deliberately descoped, not silently dropped**: broader "view
  everything" admin panels for access requests/licenses/transactions
  (the `access_request.review_any`/`license.review_any`/
  `transaction.review_any` capabilities already sit unused in
  `lib/auth/permissions.ts`'s matrix) and creator/buyer
  `verification_status` review (a separate, larger KYC-style feature
  nothing in the app currently gates on). Both are real gaps for a
  production launch, not corners cut silently.

## Audit/security hardening (Milestone 18)

- **Closes a two-milestone-old, explicitly-anticipated gap**:
  `lib/creator/profile.ts` (Milestone 5) and `lib/buyer/profile.ts`
  (Milestone 11) both already said `verification_status` was
  "admin-controlled only" — one said Milestone 17, one said Milestone
  18. Milestone 17 explicitly descoped it as a future item; landing it
  here rather than deferring a third time. `lib/admin/verification.ts`
  adds `listCreatorProfilesForReview`/`listBuyerProfilesForReview` and
  `verify*`/`reject*` for both profile types, mirroring the "manual
  admin action acceptable for v1" pattern Milestone 17 already
  established for content takedowns. There's no user-facing "request
  verification" step (nothing gates on `'pending'` either) — an admin
  can act on any profile directly. Setting the *same* status twice is
  rejected (`422`), not a silent no-op, so the audit trail only records
  real decisions. Surfaced on `/admin/dashboard` as a "Verification
  queue" filtered to `unverified`/`pending` profiles.
- **Real HTTP security headers, verified with an actual headless
  browser, not just a curl header check**: `next.config.mjs` now sets a
  genuine `Content-Security-Policy` (`default-src 'self'`, no external
  script/style/font/frame sources, `frame-ancestors 'none'`, `object-src
  'none'`, `form-action 'self'`) plus `Strict-Transport-Security`,
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a restrictive
  `Permissions-Policy`. **One real, stated tradeoff**: `script-src`/
  `style-src` still need `'unsafe-inline'` — Next.js's App Router injects
  inline hydration scripts and this app doesn't generate per-request CSP
  nonces yet (that needs a nonce threaded through middleware into every
  page, real added complexity). A stricter nonce-based `script-src` is
  genuine follow-up work, not solved here; everything else in the policy
  is as strict as the app actually needs.
- **Dependency vulnerabilities: documented, deliberately not
  force-upgraded.** `npm audit` reports 9 findings (1 critical, 6 high, 2
  moderate) as of this milestone: `vitest`/`vite`/`vite-node`/`esbuild`
  (dev/test tooling only) and, more significantly, `next` itself
  (SSRF/cache-poisoning/DoS-class CVEs in real request-handling paths).
  Every fix `npm audit` offers requires a major version bump (Next.js
  14→16, Vitest 1→4) — `npm audit fix --force` was deliberately **not**
  run: a framework major upgrade is a large, separate, high-risk
  migration effort (breaking API changes across 17 milestones of code),
  not something to do blindly inside a hardening pass. This is a real,
  flagged gap requiring its own dedicated upgrade-and-regression-test
  effort, not a silently-skipped one.
- **Stale-reference cleanup**: two README passages and two `lib/*/profile.ts`
  comments said "Milestone 18" or "Milestone 17" inconsistently for
  content moderation and verification review, written before this
  session's roadmap had actually settled those numbers. Corrected to
  match what actually shipped where.
- **Not built in this milestone, deliberately** (same descope Milestone
  17 already named, still open): broader "view everything" admin panels
  for access requests/licenses/transactions (the `*.review_any`
  capabilities in `lib/auth/permissions.ts`, still unused). Also out of
  scope: expanding rate limiting beyond the auth endpoints it already
  covers (Milestone 3) — the spec's rate-limiting requirement was
  specifically for auth endpoints, and blanket rate-limiting every route
  wasn't asked for or justified by anything found during this review.

## Analytics (Milestone 19)

- **Real platform analytics, no new schema, no external analytics/error-
  tracking provider.** The spec never names a required provider for this
  milestone (unlike payments/auth, where it explicitly blocks silently
  picking one), so `lib/admin/analytics.ts` builds entirely on data that
  already exists across `users`, `content_items`, `access_requests`,
  `licenses`, `transactions`, and `audit_logs`.
- **Funnels, not vanity metrics** — directly per the spec's own framing
  in Step 1 ("Measured by qualified-supply/qualified-demand funnels, not
  vanity metrics"). Each stage is a strict subset of the one before it
  by construction (every query narrows on the same population), not
  independent counts that could double-count or drift apart:
  - **Supply**: creator signs up → has a profile → has submitted content
    → has ever listed something.
  - **Demand**: buyer signs up → has a profile → has made a request →
    holds an active (paid) license.
- **`hasEverListed` reads from `audit_logs`** (`content.listed` actions),
  not current `rights_status` — a cumulative count that doesn't drop when
  content is later unlisted or suspended. Verified live and by an
  integration test: unlisting content after it was listed leaves this
  count unchanged.
- **Commerce totals** (GMV, platform revenue, creator payouts owed) reuse
  the exact computation Milestone 16 already does per-creator, just
  platform-wide and unfiltered — summed only over `succeeded`
  transactions, same reasoning as the earnings ledger.
- **Status breakdowns** for content (both moderation and rights status),
  access requests, licenses, and transactions — a real-time snapshot of
  where everything in the platform currently sits.
- **Daily signups, last 30 days**, zero-filled via `generate_series` so a
  quiet day still shows a row with `0`, not a gap.
- **`/admin/analytics`**, linked from `/admin/dashboard`, same protected-
  page pattern as every other admin/creator/buyer page. UI stays
  consistent with the rest of the app — plain bordered stat tiles and
  tables (the same idiom already used for placeholder grids since
  Milestone 8), not a new charting library.
- **A real test-infrastructure fix, not an application bug**: adding
  platform-wide aggregate queries surfaced that `vitest.integration.config.ts`
  ran test files in parallel against the one shared dev Postgres
  instance — harmless for every prior milestone's scoped-to-its-own-rows
  assertions, but a genuine source of flakiness for a global `COUNT(*)`
  read sandwiched between another file's concurrent insert and cleanup.
  Fixed by setting `fileParallelism: false`; confirmed deterministic
  across two consecutive full runs afterward.

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
  suspended — Milestone 17 owns the actual moderation actions) and
  `rights_status` (the 12+2-state rights machine from the spec —
  Milestone 13 owns the transition guards; this migration only defines
  the enum values).
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

**Milestone 9 specifically:** `npm run typecheck`/`lint`/`test` (62/62,
unaffected), `npm run test:integration` (57/57 — 44 prior + 13 new,
covering the audit-required gate, the SUBMITTED→LISTED→WITHDRAWN
transitions with invalid-transition rejection, cross-creator rejection,
public queries excluding non-listed items, `getMarketplaceItem`
returning `null` for both nonexistent and non-listed IDs identically,
and an explicit assertion that internal-only field names never appear
in a public response), and `npm run build` (all new routes/pages
compile, no new migrations needed). Live-verified with `curl`: listing
before an audit exists 422s with the specific message; listing after a
simulated completed audit succeeds; both public API endpoints (`curl`
with no cookie) return the item correctly; both public marketplace pages
render real server-side HTML including the honest "not the actual video
content" disclosure; a second, non-listed content item 404s on both the
public API and page; unlisting immediately empties the public listing
and 404s the detail endpoint; and a second creator gets 404 attempting
to list or unlist the first creator's content via either verb. Test data
from these live calls was deleted from the dev database afterward.

**Milestone 10 specifically:** `npm run typecheck`/`lint`/`test`
(69/69 — 62 prior + 7 new schema tests, unaffected), `npm run
test:integration` (65/65 — 57 prior + 8 new, covering full-text search
correctly narrowing/excluding, exact-match category/language filters,
JSONB-containment topic/skill filters, the quality-score threshold,
combined-filter AND semantics, and the SQL-injection-shaped-string
test), and `npm run build` (all routes compile). Migration 017 applied
cleanly against the existing populated schema. Live-verified with
`curl` against two real listed items with deliberately different
category/language/topic/skill/quality values: every filter, applied
individually via `GET /api/marketplace?...`, correctly returned exactly
the matching item and excluded the other; an out-of-range `minQuality`
correctly 422'd; and the rendered `/marketplace` page correctly filtered
its HTML output and pre-filled the submitted values back into the form.
Test data from these live calls was deleted from the dev database
afterward.

**Milestone 11 specifically:** `npm run typecheck`/`lint`/`test`
(75/75 — 69 prior + 6 new schema tests), `npm run test:integration`
(70/70 — 65 prior + 5 new, covering defaults on create, update-not-
duplicate on a second call, partial updates leaving other fields
untouched, and that `verification_status` can never be written), and
`npm run build` (all new routes/pages compile, no new migrations
needed — the table already existed). Live-verified with `curl`:
unauthenticated `/buyer/dashboard` redirects 307 to `/signin`; `GET
/api/buyer/profile` 404s before any profile exists and the dashboard
shows the "complete your profile" prompt; after `PATCH`-creating a
profile, both the API response and the rendered dashboard show the real
organization data; a `verification_status` injection attempt in the
`PATCH` body is silently ignored (stays `"unverified"`); and a signed-in
**creator** gets `403` on `/api/buyer/profile` and is redirected away
from `/buyer/dashboard`. Test data from these live calls was deleted
from the dev database afterward.

**Milestone 12 specifically:** `npm run typecheck`/`lint`/`test`
(81/81 — 75 prior + 6 new schema tests), `npm run test:integration`
(84/84 — 70 prior + 14 new, covering: rejecting a request against a
non-listed item, duplicate-request idempotency, buyer/creator query
scoping, `getOwnAccessRequestForContent` returning `null` for a never-
requested item and for a creator session, the full approve/reject
lifecycle, rejecting re-resolution of an already-resolved request,
cross-creator rejection with the row confirmed untouched afterward, and
that `rights_status` never changes as a side effect of approval), and
`npm run build` (all new routes compile, no new migrations needed —
`access_requests` already existed). Live-verified end to end with
`curl` across a real creator and a real buyer account: the asset detail
page correctly rendered all four session states (signed out / no buyer
profile / has profile+no request / has a request), a real request was
submitted through the actual API, re-submitting returned the same
request id, the creator dashboard showed the real buyer organization
name and Approve/Reject buttons, approval succeeded and was reflected
on both dashboards, re-approving 422'd, `rights_status` stayed `LISTED`
in the database, and a second creator (with their own profile) got 404
attempting to resolve the first creator's request. Test data from these
live calls was deleted from the dev database afterward.

**Milestone 13 specifically:** `npm run typecheck`/`lint`/`test`
(93/93 — 81 prior + 12 new state-machine unit tests), `npm run
test:integration` (85/85 — 84 prior + 1 new gate-failure test, plus
several existing tests updated to reflect the new post-submission state
and listing precondition), `npm run migrate` (no new migration needed —
this milestone is pure application-layer logic against the existing
`rights_status` enum), and `npm run build` all pass. Live-verified end
to end with `curl` against a real creator account: submitting content
returned `rights_status: "AUTHORIZED_FOR_PROCESSING"` immediately (the
auto-chain from `SUBMITTED`, confirmed via the API response, not
inferred); attempting to list it before an audit correctly `422`'d with
`"Cannot transition content from rights_status
'AUTHORIZED_FOR_PROCESSING' to 'LISTED'"`; after simulating a completed
audit (direct DB insert + `rights_status` update, mirroring what
`workers/audit/processor.ts` now does on success — no `ANTHROPIC_API_KEY`
in this environment, same limitation as Milestone 7), listing succeeded
and the item appeared in `GET /api/marketplace`; unlisting transitioned
it to `WITHDRAWN`. Test data from these live calls was deleted from the
dev database afterward. The `ACTIVE -> WITHDRAWN` safety property (no
direct edge) is verified by a dedicated unit test rather than live,
since no code path can reach `ACTIVE` yet.

**Milestone 14 specifically:** `npm run typecheck`/`lint`/`test`
(98/98 — 93 prior + 5 new licensing-terms schema tests), `npm run
test:integration` (94/94 — 85 prior + 9 new: `setLicensingTerms`/
`getLicensingTermsForCreator` covering the default commission split,
upsert-not-duplicate, cross-creator rejection, and create-vs-update audit
log entries; `listLicensesForCreator`/`listLicensesForBuyer` scoping; and
new `approveAccessRequest` cases for the pre-terms rejection, no-license-
on-reject, and the license's exact `terms_snapshot` contents), `npm run
migrate` (no new migration — this milestone is pure application logic
against the existing `licensing_terms`/`licenses` tables), and `npm run
build` all pass with the new routes/pages compiled in. Live-verified end
to end with `curl` across a real creator and a real buyer account:
approving a request before licensing terms were set correctly `422`'d
with "set licensing terms for this content before approving requests";
`GET .../licensing-terms` returned `{"terms": null}` beforehand; `PATCH`-
setting terms returned `creator_share_percent: "80.00"` /
`platform_share_percent: "20.00"` without either ever being sent in the
request body; approving afterward succeeded and both
`GET /api/creator/licenses` and `GET /api/buyer/licenses` returned the
same license (`status: "pending_payment"`, the real `terms_snapshot`),
correctly scoped to each side; both dashboards rendered the real license
data server-side; and `content_items.rights_status` stayed `'LISTED'`
throughout. Test data from these live calls was deleted from the dev
database afterward. One regression caught and fixed during this
milestone's own verification, not by a pre-written test: the existing
`afterEach` cleanup in `access-requests.test.ts`/`licensing.test.ts`
deleted test users directly, which started failing once those tests
began creating real `licenses` rows, because `licenses.creator_id`/
`buyer_id` are `ON DELETE RESTRICT` by design (migration 009 — an
existing license must never be silently destroyed by deleting its
creator/buyer). Fixed by deleting the test's own `licenses` rows before
deleting its users in both files' cleanup, and by manually clearing a
small backlog of orphaned test users/licenses left behind by test runs
during this same fix cycle, before the fix landed.

**Milestone 15 specifically:** `npm run typecheck`/`lint`/`test`
(106/106 — 98 prior + 8 new, real Stripe-signature unit tests), `npm run
test:integration` (104/104 — 94 prior + 10 new covering checkout-session
creation, ownership/status/no-price rejections, license activation with
the exact reconciling `transactions` amounts, audit log entries,
idempotent replay, unhandled/unpaid events, and an unrecognized license
id never throwing), `npm run migrate` (no new migration — `licenses`/
`transactions` already existed from Milestones 2/7), and `npm run build`
all pass with the new routes compiled in (`stripe` is now a real
dependency, installed and its actual TypeScript definitions read before
writing any client code — `npm audit`'s pre-existing findings are all in
`next`/`eslint`/`vitest` devDependencies, unrelated to `stripe`). Live-
verified end to end with `curl` and a real running server: submit → list
→ set a $250 price → request → approve → a real `pending_payment`
license; starting checkout with no `STRIPE_SECRET_KEY` configured failed
closed (no fabricated checkout URL, license untouched); a **genuinely
signed** webhook payload (built with the actual `stripe` SDK's
`Stripe.webhooks.generateTestHeaderString`, verified against a real
`STRIPE_WEBHOOK_SECRET` set on the running server — not mocked) correctly
activated the license (`status: "active"`, `start_date` set) and created
a `transactions` row with the exact expected split (`buyer_amount:
"250.00"`, `creator_amount: "200.00"`, `platform_fee: "50.00"`);
replaying the identical signed payload was a verified no-op (`{"handled":
false}`, still exactly one `transactions` row); a tampered signature and
a missing `Stripe-Signature` header both correctly `400`'d; and both
dashboards rendered the real `active` status server-side. Test data
(including the transaction and license rows, respecting the same FK
order as the automated tests) was deleted from the dev database
afterward.

**Milestone 16 specifically:** `npm run typecheck`/`lint`/`test`
(106/106, unchanged — this milestone adds no new input schema to unit-
test), `npm run test:integration` (109/109 — 104 prior + 5 new, covering
a zero-transaction creator, the 80% share summed correctly across
multiple paid licenses, per-entry content/buyer/share details, cross-
creator scoping, and a failed transaction correctly excluded from the
total while still appearing in the ledger), `npm run migrate` (no new
migration — pure read logic over `transactions`/`licenses`), and `npm
run build` all pass with the new route compiled in. Live-verified end to
end with `curl` and a real running server: a fresh creator's earnings
were exactly `{"totalEarned": "0.00", "transactionCount": 0}` before any
sale; after the full submit → list → price ($400) → request → approve →
pay chain (the last step a genuinely Stripe-signed webhook, same
real-SDK-signing approach as Milestone 15), `GET /api/creator/earnings`
correctly returned `totalEarned: "320.00"` (80% of $400) with one ledger
entry showing the buyer org and the creator's own share; and the creator
dashboard rendered both the summary and the entry server-side. Test data
was deleted from the dev database afterward.

**Milestone 17 specifically:** `npm run typecheck`/`lint`/`test`
(106/106, unchanged — no new input schema), `npm run test:integration`
(130/130 — 109 prior + 21 new across two new test files: content
moderation queue scoping and non-admin rejection, approve/reject from
`pending_review` only, the listing gate rejecting a rights-eligible-but-
unapproved item and allowing it once approved, suspend/reinstate driving
`rights_status` only when the item is actually `LISTED`, the ACTIVE-style
non-transition case, audit log entries for every action, user listing
without password hashes, suspend/reinstate genuinely round-tripping
through `verifyCredentials`, refusing to suspend an admin, and 404/403
cases), `npm run migrate` (no new migration — pure application logic
against existing `content_moderation_status`/`users.status` columns),
and `npm run build` all pass with the new `/admin/dashboard` page and
eight new API routes compiled in. Live-verified end to end with `curl`
against a real running server and a real admin account (seeded via the
app's own `hashPassword()`, per the Milestone 3 decision that admin
provisioning stays manual): a rights-eligible item correctly `422`'d on
listing with "content must be approved by an admin" before any
moderation action; appeared in the real moderation queue
(`GET /api/admin/content`); a **non-admin** creator got a real `403`
attempting the same approve endpoint; approving it as the real admin let
the exact same listing call succeed immediately after; suspending the
now-listed item removed it from `GET /api/marketplace` in the same
request cycle, and reinstating brought it back; and suspending a real
creator account via `POST /api/admin/users/[id]/suspend` caused that
creator's next real sign-in attempt to fail with the same generic
`CredentialsSignin` error any wrong password produces (verified via the
actual NextAuth credentials callback, not inferred). Test data —
including the seeded admin account — was deleted from the dev database
afterward.

**Milestone 18 specifically:** `npm run typecheck`/`lint`/`test`
(106/106, unchanged — no new input schema), `npm run test:integration`
(138/138 — 130 prior + 8 new covering both verify/reject paths for both
profile types, the same-status-twice rejection, changing a decision,
404/403 cases, and distinct audit log entries per profile type), `npm
run migrate` (no new migration — pure application logic against the
existing `verification_status` column), and `npm run build` all pass
with the six new admin API routes compiled in. Live-verified end to end
with `curl` and a real seeded admin account: a fresh creator profile
listed as `unverified` in `GET /api/admin/creator-profiles`; a
**non-admin** got a real `403` on the same endpoint; verifying it
returned `verification_status: "verified"`; verifying it again correctly
`422`'d ("Profile is already 'verified'"). The security headers were
verified two ways beyond a plain curl header check: `curl -I` confirmed
all six headers present with the exact configured values, and a real
headless-browser load (Playwright/Chromium) of the public marketplace,
signin/signup pages, and the **signed-in** creator and buyer dashboards
(via injected session cookies from real logins) showed zero
CSP-related console errors across all of them — the only console error
seen anywhere was an unrelated pre-existing `/favicon.ico` 404, confirmed
via a direct `curl` and unrelated to this milestone's changes. Test data
(including the CSP-check accounts and the seeded admin) was deleted from
the dev database afterward.

**Milestone 19 specifically:** `npm run typecheck`/`lint`/`test`
(106/106, unchanged — no new input schema), `npm run test:integration`
(142/142 — 138 prior + 4 new covering non-admin rejection, the full
supply-and-demand funnel moving in lockstep via before/after deltas
(robust to concurrent noise from other test files), `hasEverListed`
staying constant across an unlist, and the 30-row zero-filled daily
signups window), `npm run migrate` (no new migration — pure read logic
over existing tables), and `npm run build` all pass with the new
`/admin/analytics` page and its API route compiled in. Fixed one real
test-infrastructure flake in the same pass (see the milestone section
above: `fileParallelism: false`), confirmed deterministic across two
consecutive full integration runs. Live-verified end to end with `curl`
against a real running server: analytics read all-zero on a clean
database; after running the complete submit → admin-approve → list →
price ($300) → request → approve → pay chain (the payment step a
genuinely Stripe-signed webhook, same real-SDK-signing approach as
Milestones 15/16), every funnel stage, status breakdown, and commerce
total updated to exactly the expected values in one call
(`gmv: "300.00"`, `platformRevenue: "60.00"`, `creatorPayoutsOwed:
"240.00"` — the same 80/20 split verified in every milestone since 14);
today's row in the daily-signups table showed the real counts; the
`/admin/analytics` page rendered the real GMV figure server-side; and a
non-admin got a real `403` on the API and a `307` redirect on the page.
Test data was deleted from the dev database afterward.
