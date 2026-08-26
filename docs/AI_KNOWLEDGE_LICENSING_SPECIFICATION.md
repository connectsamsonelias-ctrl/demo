# AI Knowledge Licensing Platform — Finalized Kickoff Review

**Status:** Pre-implementation review complete. No application code has been written for this project yet (Step 7 of the kickoff protocol — awaiting "Start Milestone 1").
**Source of truth:** `AI_Knowledge_Licensing_Platform_MVP_Engineering_Spec_v1.md` (authoritative for schema/API/screens). The Master Handoff doc is historical strategy context; where the two differ on field names, the Engineering Spec wins.
**Note on this repo:** at the time of this review the repository contains an unrelated existing project (a RAG maintenance troubleshooter). This document and all future milestones for the AI Knowledge Licensing Platform will be added alongside it without modifying that project's files.

---

## Step 1 — Understanding

- **Business model:** two-sided marketplace; platform takes a commission (illustrative 20%) on buyer payments for licensed access to creator content/knowledge. Creator retains ownership; the platform licenses usage rights only.
- **Wedge:** creator-owned video/content, starting with creator-submitted URLs (YouTube first). Acquisition mechanism is a free "AI Knowledge Audit."
- **Creator workflow:** signup → submit content → authorize processing → AI audit report (categories/skills/quality/potential use cases, never guaranteed value) → opt-in to licensing with explicit terms → listing goes live → approve/reject buyer requests → earnings.
- **Buyer workflow:** signup with org profile → search/browse → asset detail → request access → wait for approval → pay → access → usage tracked.
- **Platform workflow:** identity, rights-state enforcement, moderation, server-verified payments, payout ledger, audit logging on every rights-sensitive change.
- **AI Knowledge Audit:** the acquisition product itself — content overview, knowledge extraction, quality signals, potential (not guaranteed) use cases. Staged/tiered processing to control AI cost.
- **Rights/licensing model:** rights are a first-class, explicit per-content state machine. Public visibility (e.g. a public YouTube video) is never treated as commercial-use permission — authorization is a distinct, separately captured step.
- **Monetization:** V1 = marketplace commission only. Percentages snapshotted per-transaction at creation time; never recalculated from a creator's current rate.
- **Acquisition strategy:** paid ads to two standalone free products (creator audit, buyer discovery) rather than manual outreach, to solve cold-start. Measured by qualified-supply/qualified-demand funnels, not vanity metrics.
- **MVP boundaries:** no custom LLM, no microservices, no vector DB, no mobile app, no blockchain, no enterprise SSO. Modular monolith (Next.js/TS), PostgreSQL, external AI APIs, managed auth/storage/payments, Postgres full-text search.

---

## Step 2 — Challenge

### A. Must resolve before coding

1. **Authorization language is undefined.** The spec defers exact legal wording to counsel, but the MVP still needs a concrete authorization capture flow (explicit checkbox + itemized granted-rights list) on day one — every asset the AI pipeline touches depends on this existing, even in placeholder form. **[LEGAL APPROVAL REQUIRED]**
2. **No ownership verification for submitted URLs.** Nothing in the flow stops a creator from submitting content they don't own. The MVP needs an explicit ownership attestation at submission plus a working (even if manual/admin-driven) takedown process before any public listing goes live. **[LEGAL/OPS — MUST EXIST DAY ONE]**
3. **Payment provider and supported countries/currencies are unchosen.** "Provider-agnostic" is fine architecturally, but webhook shape, payout mechanics, and cross-border creator payout compliance (KYC, tax forms) depend on picking one before the Payments milestone. **[BUSINESS DECISION]**
4. **Withdrawal-vs-active-license behavior is explicitly unresolved in the source spec** ("must be defined by counsel"). Engineering stub for v1: **existing ACTIVE licenses always survive withdrawal; no exceptions.** No new licenses issue after withdrawal. This must be revisited once contract language is approved. **[LEGAL APPROVAL REQUIRED]**
5. **Schema/terminology drift between the two source docs** — resolved by treating the Engineering Spec v1 as authoritative.
6. **YouTube ingestion method carries platform-level ToS risk independent of creator rights.** Recommend MVP use YouTube's official Data API + caption endpoints only, not scraping/downloading video. **[NEEDS CONFIRMATION]**
7. **Auth provider choice** — affects the auth abstraction built in Milestone 3; needs to be picked (not just abstracted) before that milestone starts.

### B. Can be decided during development

- Quality-scoring algorithm/weights.
- Postgres full-text search ranking/config specifics.
- Specific AI vendor per pipeline tier (abstracted behind `lib/ai`, swappable).
- Object storage provider (S3/R2/Supabase Storage).
- Default commission percentage value (must be configurable, not hardcoded, regardless of value chosen).
- Visual design system.
- Email/notification provider.

### C. Can wait until after MVP

- Enterprise API/integrations.
- Advanced search / vector retrieval.
- Recommendation engine.
- Multi-region deployment, caching layer, dedicated message-broker queue infra.
- Subscription / API-usage monetization tiers.
- Creator reputation/history system.

### Other risks

- **Security:** rights status, license status, payout amounts, commission, and payment confirmation must never be client-settable — enforced via server-only mutation paths and DB constraints, not just convention.
- **Scalability:** nothing material at MVP scale; modular monolith + managed Postgres is correctly sized. Do not add Redis/queue brokers/vector DB until real usage justifies it.
- **Complexity to avoid:** no generic workflow engine for the rights state machine — a plain enum column plus server-side transition-guard functions is sufficient.

---

## Step 3 — Architecture

Modular monolith: Next.js + TypeScript + Tailwind, PostgreSQL (managed), managed auth provider, managed object storage, managed payment provider, external LLM APIs behind an internal `lib/ai` abstraction, Postgres full-text search + indexed filter columns for marketplace search, background jobs via a `content_processing_jobs` table + polling worker process (no external queue broker needed at this scale), managed hosting + managed error tracking/analytics.

Explicitly rejected for v1 (revisit only after validated demand): microservices, vector database, Kubernetes, custom/trained models, multi-region infra, enterprise SSO.

---

## Step 4 — Finalized specification

The Engineering Spec v1 (Sections 4–19) is accepted as the implementation-ready PRD, screen map, roles/permissions, database schema, API contract, rights state machine, licensing/payment workflow, AI pipeline, security model, audit model, background-job architecture, and repository structure. No structural changes were made to it; the following items are called out as requiring approval before the relevant milestone, rather than silently resolved:

| Item | Gate | Milestone affected |
|---|---|---|
| Authorization/consent copy (ToS, privacy, C03/C05 language) | Legal | Content submission, Licensing setup |
| Withdrawal-vs-active-license behavior | Legal (stub: survives, no exceptions) | Rights management |
| Payment provider + jurisdictions | Business | Payments |
| Default commission split / per-license-type variance | Business | Licensing, Payments |
| YouTube ingestion method (API+captions vs. scraping) | Product/Legal | Content submission, AI pipeline |
| Takedown/DMCA process (manual admin action acceptable for v1) | Legal/Ops | Content submission, Admin |
| Auth provider selection | Engineering/Business | Authentication |

**Testing strategy:** unit tests for rights-state transition guards and payout-calculation math (highest-risk correctness surface — must never misround or leak values); integration tests for authorization boundaries and payment webhook verification; e2e tests for the three golden paths (creator submit→list, buyer request→pay→access, admin approve/audit).

**Deployment strategy:** managed hosting platform, environment-variable-based config, migrations run in CI prior to deploy, no direct production database writes outside migrations/application code paths.

---

## Step 5 — Development roadmap

Accepted milestone sequence (1–20), per the Engineering Spec Section 21 / this kickoff prompt:

1. Repository foundation
2. Database foundation
3. Authentication
4. Role/permission system
5. Creator profile
6. Content submission
7. AI Knowledge Audit
8. Creator dashboard
9. Marketplace
10. Search/filtering
11. Buyer onboarding
12. Access requests
13. Rights management
14. Licensing
15. Payments
16. Creator earnings
17. Admin dashboard
18. Audit/security hardening
19. Analytics
20. SEO/launch

Per-milestone objective, files/modules, database changes, API changes, dependencies, acceptance criteria, tests, security considerations, and complexity estimate will be produced at the start of each milestone (starting with Milestone 1: Repository foundation) after inspecting the actual repository state at that time, per the Step 6 coding workflow below.

---

## Step 6 — Claude coding workflow (in effect for all future milestones)

For every future coding task in this project:

1. Inspect the existing repository first.
2. Do not rewrite unrelated code (this repo also hosts an unrelated RAG troubleshooter project — never touch it while working on this project).
3. Explain the implementation plan before implementing.
4. Implement only the requested scope.
5. Write/update tests.
6. Run type checking, linting, and relevant tests — never claim a check passed without having actually run it.
7. Report exactly what changed, what failed, and what requires human review.
8. Never expose secrets; never trust client-side authorization; never let the client control rights status, license status, payout amounts, commission, payment confirmation, or admin permissions — all such authorization is server-side only.

---

## Step 7 — Status: stopped before coding

This review is complete. No application code has been written. Waiting for the instruction **"Start Milestone 1"** to begin Repository foundation.
