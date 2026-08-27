import { query } from "@/lib/db/pool";
import { requireCreatorProfileId } from "@/lib/auth/ownership";
import type { Session } from "@/lib/auth/session";
import type { TransactionRow } from "@/lib/db/types";

/**
 * Read-only earnings ledger, built entirely from data Milestone 15
 * already produces (transactions, joined through licenses.creator_id) —
 * no new schema. This shows what a creator has earned; it does not move
 * any money to them. Real payout execution (a creator's bank account,
 * Stripe Connect onboarding, KYC, tax forms) is a separate, still-open
 * business/compliance decision the spec itself defers — not resolved
 * here, and not silently invented.
 *
 * `totalEarned` counts only `succeeded` transactions. A refunded
 * transaction is not currently subtracted back out — no code path sets
 * `transaction_status = 'refunded'` yet (flagged in the Milestone 15
 * README as unwired), so this is a real, documented gap rather than a
 * silently-handled case.
 */
export interface CreatorEarningsSummary {
  totalEarned: string;
  currency: string;
  transactionCount: number;
}

export async function getEarningsSummaryForCreator(session: Session): Promise<CreatorEarningsSummary> {
  const creatorId = await requireCreatorProfileId(session);
  const rows = await query<{ totalEarned: string; transactionCount: number }>(
    `SELECT COALESCE(SUM(t.creator_amount), 0)::numeric(12,2) AS "totalEarned",
            COUNT(*)::int AS "transactionCount"
     FROM transactions t
     JOIN licenses l ON l.id = t.license_id
     WHERE l.creator_id = $1 AND t.status = 'succeeded'`,
    [creatorId]
  );
  const row = rows[0]!;
  return { totalEarned: row.totalEarned, currency: "USD", transactionCount: row.transactionCount };
}

export interface CreatorEarningsEntry extends TransactionRow {
  contentItemTitle: string;
  buyerOrganizationName: string;
}

/** All transactions regardless of status (a ledger, not just the successful ones) — status is shown per row so a creator can see pending/failed activity too. */
export async function listEarningsForCreator(session: Session): Promise<CreatorEarningsEntry[]> {
  const creatorId = await requireCreatorProfileId(session);
  return query<CreatorEarningsEntry>(
    `SELECT t.*, ci.title AS "contentItemTitle", bp.organization_name AS "buyerOrganizationName"
     FROM transactions t
     JOIN licenses l ON l.id = t.license_id
     JOIN content_items ci ON ci.id = l.content_item_id
     JOIN buyer_profiles bp ON bp.id = l.buyer_id
     WHERE l.creator_id = $1
     ORDER BY t.created_at DESC`,
    [creatorId]
  );
}
