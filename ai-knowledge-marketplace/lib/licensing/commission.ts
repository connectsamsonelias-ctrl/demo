/**
 * Default commission split, applied to every new `licensing_terms` row.
 * Per the spec: "Default commission percentage value (must be
 * configurable, not hardcoded, regardless of value chosen)" and flagged
 * separately as a **Business** decision, not an engineering one. Confirmed
 * with the user for Milestone 14: 80% creator / 20% platform, matching the
 * spec's own "illustrative 20%" commission figure.
 *
 * This is a single global default, not per-creator or per-license-type —
 * "per-license-type variance" is explicitly flagged in the spec as a
 * separate, still-open business decision, not resolved here.
 *
 * Never read directly by client code: `creator_share_percent`/
 * `platform_share_percent` are set server-side only when a
 * `licensing_terms` row is created (lib/creator/licensing-terms.ts) —
 * never accepted from a request body, per the spec's rule that commission
 * must never be client-settable.
 */
export const DEFAULT_CREATOR_SHARE_PERCENT = 80;
export const DEFAULT_PLATFORM_SHARE_PERCENT = 20;
