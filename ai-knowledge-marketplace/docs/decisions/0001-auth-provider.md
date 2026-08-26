# 0001 — Auth provider selection

**Status:** Open — needs a decision before Milestone 3 (Authentication).

Milestone 1 ships `lib/auth/session.ts` as an interface
(`AuthProvider.getSession`) plus a `DevStubAuthProvider` that only works
outside production. A real provider (e.g. a managed auth service) will
implement the same interface in Milestone 3 — no other module needs to
change when that happens, since `lib/auth/authorize.ts` and every route
depend only on `getSession()` / `requireRole()`, not on a specific vendor.

Decision needed from you before Milestone 3 starts. See the kickoff
review (`docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md`, Step 2A, item 7).
