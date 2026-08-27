import { query } from "@/lib/db/pool";
import { requireAdmin } from "@/lib/auth/admin";
import type { Session } from "@/lib/auth/session";

/**
 * Real platform analytics, built entirely from data that already exists
 * (users, content_items, access_requests, licenses, transactions,
 * audit_logs) — no new schema, no external analytics/error-tracking
 * provider. The spec's Step 1 explicitly frames this as
 * "qualified-supply/qualified-demand funnels, not vanity metrics", so
 * that's the shape below: each stage is a strict subset of the one
 * before it, not independent counts that could double-count or drift.
 */

export interface SupplyFunnel {
  signedUp: number;
  hasProfile: number;
  hasSubmittedContent: number;
  hasEverListed: number;
}

export interface DemandFunnel {
  signedUp: number;
  hasProfile: number;
  hasMadeRequest: number;
  hasActiveLicense: number;
}

export interface StatusBreakdown {
  status: string;
  count: number;
}

export interface CommerceTotals {
  gmv: string; // sum of buyer_amount on succeeded transactions
  platformRevenue: string; // sum of platform_fee on succeeded transactions
  creatorPayoutsOwed: string; // sum of creator_amount on succeeded transactions
  succeededTransactionCount: number;
}

export interface DailySignups {
  date: string;
  creators: number;
  buyers: number;
}

export interface PlatformAnalytics {
  supplyFunnel: SupplyFunnel;
  demandFunnel: DemandFunnel;
  contentByModerationStatus: StatusBreakdown[];
  contentByRightsStatus: StatusBreakdown[];
  accessRequestsByStatus: StatusBreakdown[];
  licensesByStatus: StatusBreakdown[];
  transactionsByStatus: StatusBreakdown[];
  commerceTotals: CommerceTotals;
  dailySignups: DailySignups[];
}

async function getSupplyFunnel(): Promise<SupplyFunnel> {
  const rows = await query<{
    signedUp: number;
    hasProfile: number;
    hasSubmittedContent: number;
    hasEverListed: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE role = 'creator') AS "signedUp",
       (SELECT COUNT(*)::int FROM creator_profiles) AS "hasProfile",
       (SELECT COUNT(DISTINCT creator_id)::int FROM content_items) AS "hasSubmittedContent",
       (SELECT COUNT(DISTINCT actor_id)::int FROM audit_logs WHERE action = 'content.listed') AS "hasEverListed"`
  );
  return rows[0]!;
}

async function getDemandFunnel(): Promise<DemandFunnel> {
  const rows = await query<{
    signedUp: number;
    hasProfile: number;
    hasMadeRequest: number;
    hasActiveLicense: number;
  }>(
    `SELECT
       (SELECT COUNT(*)::int FROM users WHERE role = 'buyer') AS "signedUp",
       (SELECT COUNT(*)::int FROM buyer_profiles) AS "hasProfile",
       (SELECT COUNT(DISTINCT buyer_id)::int FROM access_requests) AS "hasMadeRequest",
       (SELECT COUNT(DISTINCT buyer_id)::int FROM licenses WHERE status = 'active') AS "hasActiveLicense"`
  );
  return rows[0]!;
}

async function getContentByModerationStatus(): Promise<StatusBreakdown[]> {
  return query<StatusBreakdown>(
    "SELECT status::text AS status, COUNT(*)::int AS count FROM content_items GROUP BY status ORDER BY status"
  );
}

async function getContentByRightsStatus(): Promise<StatusBreakdown[]> {
  return query<StatusBreakdown>(
    "SELECT rights_status::text AS status, COUNT(*)::int AS count FROM content_items GROUP BY rights_status ORDER BY rights_status"
  );
}

async function getAccessRequestsByStatus(): Promise<StatusBreakdown[]> {
  return query<StatusBreakdown>(
    "SELECT status::text AS status, COUNT(*)::int AS count FROM access_requests GROUP BY status ORDER BY status"
  );
}

async function getLicensesByStatus(): Promise<StatusBreakdown[]> {
  return query<StatusBreakdown>(
    "SELECT status::text AS status, COUNT(*)::int AS count FROM licenses GROUP BY status ORDER BY status"
  );
}

async function getTransactionsByStatus(): Promise<StatusBreakdown[]> {
  return query<StatusBreakdown>(
    "SELECT status::text AS status, COUNT(*)::int AS count FROM transactions GROUP BY status ORDER BY status"
  );
}

async function getCommerceTotals(): Promise<CommerceTotals> {
  const rows = await query<{
    gmv: string;
    platformRevenue: string;
    creatorPayoutsOwed: string;
    succeededTransactionCount: number;
  }>(
    `SELECT
       COALESCE(SUM(buyer_amount), 0)::numeric(12,2) AS gmv,
       COALESCE(SUM(platform_fee), 0)::numeric(12,2) AS "platformRevenue",
       COALESCE(SUM(creator_amount), 0)::numeric(12,2) AS "creatorPayoutsOwed",
       COUNT(*)::int AS "succeededTransactionCount"
     FROM transactions
     WHERE status = 'succeeded'`
  );
  return rows[0]!;
}

/** Last 30 days, oldest first, zero-filled — a day with no signups still appears as a row with count 0. */
async function getDailySignups(): Promise<DailySignups[]> {
  return query<DailySignups>(
    `SELECT
       to_char(d.day, 'YYYY-MM-DD') AS date,
       COALESCE(c.count, 0)::int AS creators,
       COALESCE(b.count, 0)::int AS buyers
     FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS d(day)
     LEFT JOIN (
       SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
       FROM users WHERE role = 'creator' GROUP BY 1
     ) c ON c.day = d.day
     LEFT JOIN (
       SELECT date_trunc('day', created_at) AS day, COUNT(*) AS count
       FROM users WHERE role = 'buyer' GROUP BY 1
     ) b ON b.day = d.day
     ORDER BY d.day ASC`
  );
}

export async function getPlatformAnalytics(session: Session): Promise<PlatformAnalytics> {
  requireAdmin(session);
  const [
    supplyFunnel,
    demandFunnel,
    contentByModerationStatus,
    contentByRightsStatus,
    accessRequestsByStatus,
    licensesByStatus,
    transactionsByStatus,
    commerceTotals,
    dailySignups,
  ] = await Promise.all([
    getSupplyFunnel(),
    getDemandFunnel(),
    getContentByModerationStatus(),
    getContentByRightsStatus(),
    getAccessRequestsByStatus(),
    getLicensesByStatus(),
    getTransactionsByStatus(),
    getCommerceTotals(),
    getDailySignups(),
  ]);
  return {
    supplyFunnel,
    demandFunnel,
    contentByModerationStatus,
    contentByRightsStatus,
    accessRequestsByStatus,
    licensesByStatus,
    transactionsByStatus,
    commerceTotals,
    dailySignups,
  };
}
