import { ValidationError } from "@/lib/errors";
import type { RightsStatus } from "@/lib/db/types";

/**
 * The complete `rights_status` transition graph from
 * docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md Section 9, encoded as data
 * so it can be tested independently of whatever code path currently
 * triggers a given edge.
 *
 * Not every edge here is reachable by shipped code yet. Some are simply
 * future work (ACTIVE's withdrawal-request path isn't assigned to any
 * milestone on the current roadmap); LICENSE_REQUESTED and LICENSED
 * specifically are permanent graph-only nodes that this implementation
 * has now decided (as of Milestone 14) will never be triggered at all —
 * see the per-edge comments below. They're included now so the graph is
 * complete and its safety properties (see below) are enforced from day
 * one, not bolted on later.
 *
 * Two deliberate simplifications versus the spec's literal linear diagram,
 * both decided in earlier milestones and just formalized here:
 *
 * - SUBMITTED -> AUTHORIZED_FOR_PROCESSING skips AUTHORIZATION_PENDING.
 *   Milestone 6 made ownership attestation a precondition of row creation
 *   (`contentSubmissionSchema` requires `ownershipAttested: true`), so
 *   there is never a real "pending authorization" window to represent
 *   honestly. AUTHORIZATION_PENDING stays a valid enum value for schema
 *   completeness/future extensibility, but no code path in this
 *   implementation ever sets it.
 * - AUTHORIZED_FOR_PROCESSING -> LICENSING_ELIGIBLE skips
 *   ANALYSIS_COMPLETE, for the same reason: no distinguishing
 *   business/quality gate exists yet between "analysis just finished" and
 *   "eligible for licensing" at this MVP stage.
 *
 * Critical safety property, enforced structurally by this graph and
 * covered by a dedicated unit test: there is NO direct ACTIVE ->
 * WITHDRAWN edge. The only path out of ACTIVE is
 * ACTIVE -> WITHDRAWAL_REQUESTED -> CONTRACTUAL_REVIEW. This is the
 * code-level enforcement of the kickoff review's stubbed legal policy
 * that existing ACTIVE licenses always survive a withdrawal request in
 * v1 — an active license can never be silently killed by a single
 * transition, even though no code path can reach ACTIVE yet.
 */
export const RIGHTS_STATUS_TRANSITIONS: Record<RightsStatus, RightsStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["AUTHORIZATION_PENDING", "AUTHORIZED_FOR_PROCESSING"],
  AUTHORIZATION_PENDING: ["AUTHORIZED_FOR_PROCESSING"], // not yet triggered by any code path
  AUTHORIZED_FOR_PROCESSING: ["ANALYSIS_COMPLETE", "LICENSING_ELIGIBLE"],
  ANALYSIS_COMPLETE: ["LICENSING_ELIGIBLE"], // not yet triggered by any code path
  LICENSING_ELIGIBLE: ["LISTED"],
  // LISTED -> SUSPENDED and its reverse (below) are triggered for real as
  // of Milestone 17 (Admin): lib/admin/content.ts's suspendContent/
  // reinstateContent.
  LISTED: ["LICENSE_REQUESTED", "LICENSED", "WITHDRAWN", "SUSPENDED"],
  LICENSE_REQUESTED: ["LICENSED"], // not yet triggered, and never will be by this implementation —
  // access requests are a separate 1:many `access_requests` table (Milestone 12), and
  // Milestone 14 confirmed the same reasoning for the `licenses` table itself: a content
  // item can have many concurrent licenses to different buyers, so a single-valued
  // rights_status can never represent "has a license" without conflating that 1:many
  // relationship into a 1:1 field. See lib/creator/requests.ts's
  // createLicenseForApprovedRequest.
  LICENSED: ["ACTIVE"], // not yet triggered, same reasoning as LICENSE_REQUESTED above
  ACTIVE: ["WITHDRAWAL_REQUESTED"], // not yet triggered — not assigned to a milestone yet. No ACTIVE -> WITHDRAWN edge, by design.
  WITHDRAWAL_REQUESTED: ["CONTRACTUAL_REVIEW"], // not yet triggered
  CONTRACTUAL_REVIEW: ["WITHDRAWN"], // not yet triggered — the only way an ACTIVE license's content ever reaches WITHDRAWN
  WITHDRAWN: [],
  SUSPENDED: ["LISTED"], // triggered as of Milestone 17 (Admin) reinstatement
};

export function isValidRightsTransition(from: RightsStatus, to: RightsStatus): boolean {
  return RIGHTS_STATUS_TRANSITIONS[from].includes(to);
}

/** Throws ValidationError with a message naming both the offending states if the transition isn't allowed. */
export function assertValidRightsTransition(from: RightsStatus, to: RightsStatus): void {
  if (!isValidRightsTransition(from, to)) {
    throw new ValidationError(`Cannot transition content from rights_status '${from}' to '${to}'.`);
  }
}
