import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth/session";
import { getPlatformAnalytics } from "@/lib/admin/analytics";

export const dynamic = "force-dynamic";

function FunnelStage({ label, count, of }: { label: string; count: number; of: number }) {
  const pct = of > 0 ? Math.round((count / of) * 100) : 0;
  return (
    <div className="flex items-center justify-between border-t border-slate-200 py-2 text-sm first:border-t-0">
      <span className="text-slate-700">{label}</span>
      <span className="text-slate-500">
        {count} <span className="text-xs">({pct}%)</span>
      </span>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-slate-200 p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function StatusTable({ title, rows }: { title: string; rows: { status: string; count: number }[] }) {
  return (
    <div className="rounded border border-slate-200 p-4">
      <p className="text-xs font-medium text-slate-700">{title}</p>
      {rows.length === 0 ? (
        <p className="mt-2 text-xs text-slate-500">No rows yet.</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {rows.map((r) => (
            <li key={r.status} className="flex justify-between text-xs text-slate-600">
              <span>{r.status}</span>
              <span>{r.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Screen A04-equivalent (no explicit screen code in the spec for
 * Analytics). Real data throughout — no external analytics/error-
 * tracking provider (that's a separate, unmade provider decision, same
 * category as payments/auth, not invented here). Funnel stages are
 * strict subsets of each other by construction (each query narrows the
 * previous one), not independent counts that could double-count.
 */
export default async function AdminAnalyticsPage() {
  const session = await getPageSession();
  if (!session) redirect("/signin");
  if (session.role !== "admin") redirect("/");

  const a = await getPlatformAnalytics(session);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Platform analytics</h1>
        <a href="/admin/dashboard" className="text-sm underline">
          ← Admin dashboard
        </a>
      </div>

      <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="rounded border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-700">Creator supply funnel</p>
          <FunnelStage label="Signed up" count={a.supplyFunnel.signedUp} of={a.supplyFunnel.signedUp} />
          <FunnelStage label="Has profile" count={a.supplyFunnel.hasProfile} of={a.supplyFunnel.signedUp} />
          <FunnelStage
            label="Submitted content"
            count={a.supplyFunnel.hasSubmittedContent}
            of={a.supplyFunnel.signedUp}
          />
          <FunnelStage label="Ever listed" count={a.supplyFunnel.hasEverListed} of={a.supplyFunnel.signedUp} />
        </div>
        <div className="rounded border border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-700">Buyer demand funnel</p>
          <FunnelStage label="Signed up" count={a.demandFunnel.signedUp} of={a.demandFunnel.signedUp} />
          <FunnelStage label="Has profile" count={a.demandFunnel.hasProfile} of={a.demandFunnel.signedUp} />
          <FunnelStage label="Made a request" count={a.demandFunnel.hasMadeRequest} of={a.demandFunnel.signedUp} />
          <FunnelStage
            label="Holds an active license"
            count={a.demandFunnel.hasActiveLicense}
            of={a.demandFunnel.signedUp}
          />
        </div>
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="GMV (succeeded)" value={`$${a.commerceTotals.gmv}`} />
        <StatTile label="Platform revenue" value={`$${a.commerceTotals.platformRevenue}`} />
        <StatTile label="Creator payouts owed" value={`$${a.commerceTotals.creatorPayoutsOwed}`} />
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <StatusTable title="Content — moderation status" rows={a.contentByModerationStatus} />
        <StatusTable title="Content — rights status" rows={a.contentByRightsStatus} />
        <StatusTable title="Access requests" rows={a.accessRequestsByStatus} />
        <StatusTable title="Licenses" rows={a.licensesByStatus} />
        <StatusTable title="Transactions" rows={a.transactionsByStatus} />
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-slate-700">Signups, last 30 days</h2>
        <div className="mt-2 overflow-x-auto rounded border border-slate-200">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="p-2">Date</th>
                <th className="p-2">Creators</th>
                <th className="p-2">Buyers</th>
              </tr>
            </thead>
            <tbody>
              {a.dailySignups.map((d) => (
                <tr key={d.date} className="border-b border-slate-100 last:border-b-0">
                  <td className="p-2 text-slate-600">{d.date}</td>
                  <td className="p-2 text-slate-600">{d.creators}</td>
                  <td className="p-2 text-slate-600">{d.buyers}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
