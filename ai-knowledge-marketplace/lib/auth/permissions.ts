import type { Role } from "@/lib/auth/roles";

/**
 * Declarative capability matrix mirroring the spec's Section 4 (User
 * Roles). This is documentation that's also checkable: routes call
 * can(role, action) as a first-pass gate, then follow up with an
 * ownership check (lib/auth/ownership.ts) for anything resource-scoped.
 * "visitor" (unauthenticated) capabilities aren't listed here — routes
 * that are visitor-accessible simply don't call can() at all.
 *
 * This does not itself implement any route — it exists so future
 * milestones (content submission, licensing, admin) have one place to
 * add a capability and one place to see the whole matrix, instead of
 * role checks scattered ad hoc across route handlers.
 */
export const ACTIONS = [
  // Creator
  "content.create",
  "content.edit_own",
  "content.view_own_audit",
  "content.set_licensing_terms_own",
  "access_request.approve_own", // approving a request against the creator's own content
  "access_request.reject_own",
  "license.view_own",
  "earnings.view_own",
  // Buyer
  "buyer_profile.create",
  "marketplace.browse",
  "access_request.create",
  "access_request.view_own",
  "license.accept_terms_own",
  // Admin
  "user.review",
  "content.moderate",
  "rights.review",
  "access_request.review_any",
  "license.review_any",
  "transaction.review_any",
  "analytics.view",
  "user.suspend",
  "audit_log.view",
] as const;

export type Action = (typeof ACTIONS)[number];

const MATRIX: Record<Role, ReadonlySet<Action>> = {
  creator: new Set<Action>([
    "content.create",
    "content.edit_own",
    "content.view_own_audit",
    "content.set_licensing_terms_own",
    "access_request.approve_own",
    "access_request.reject_own",
    "license.view_own",
    "earnings.view_own",
  ]),
  buyer: new Set<Action>([
    "buyer_profile.create",
    "marketplace.browse",
    "access_request.create",
    "access_request.view_own",
    "license.accept_terms_own",
  ]),
  admin: new Set<Action>([
    "user.review",
    "content.moderate",
    "rights.review",
    "access_request.review_any",
    "license.review_any",
    "transaction.review_any",
    "analytics.view",
    "user.suspend",
    "audit_log.view",
  ]),
};

/**
 * Role-level gate only — does NOT check resource ownership. An action
 * ending in `_own` still needs a matching lib/auth/ownership.ts check
 * before the specific resource is touched; can() alone answers "could a
 * creator ever do this", not "may this creator do this to this row".
 */
export function can(role: Role, action: Action): boolean {
  return MATRIX[role].has(action);
}
