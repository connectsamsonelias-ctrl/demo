import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth/session";
import { getCreatorProfile } from "@/lib/creator/profile";
import { listContentItemsForCreator } from "@/lib/creator/content";
import { getLatestAudit, type AuditStatus } from "@/lib/creator/audit";
import { listAccessRequestsForCreator } from "@/lib/creator/requests";
import type { ContentItemRow } from "@/lib/db/types";
import { SignOutButton } from "./sign-out-button";
import { RunAuditButton } from "./run-audit-button";
import { ListingButton } from "./listing-button";
import { RequestActions } from "./request-actions";

export const dynamic = "force-dynamic";

/**
 * Screen C06 (Creator Dashboard). Content assets + Audit results +
 * Requests are real, queried directly (Server Component -> lib call, no
 * self-fetch round trip). Active licenses / Earnings remain
 * placeholders — those domains (Milestones 14, 16) don't exist yet, and
 * faking a "0 licenses" card from nothing would misrepresent what's
 * actually been built.
 */
export default async function CreatorDashboardPage() {
  const session = await getPageSession();
  if (!session) redirect("/signin");
  if (session.role !== "creator") redirect("/");

  const profile = await getCreatorProfile(session.userId);

  let items: ContentItemRow[] = [];
  let audits: Record<string, AuditStatus> = {};
  let requests: Awaited<ReturnType<typeof listAccessRequestsForCreator>> = [];
  if (profile) {
    items = await listContentItemsForCreator(session);
    const entries = await Promise.all(
      items.map(async (item) => [item.id, await getLatestAudit(session, item.id)] as const)
    );
    audits = Object.fromEntries(entries);
    requests = await listAccessRequestsForCreator(session);
  }

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Creator dashboard</h1>
        <SignOutButton />
      </div>

      {!profile ? (
        <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          You haven&apos;t set up your creator profile yet.{" "}
          <a href="/creator/profile/edit" className="underline">
            Complete your profile
          </a>{" "}
          to start submitting content.
        </div>
      ) : (
        <section className="mt-6">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">Content assets</h2>
            <a href="/creator/content/new" className="text-sm underline">
              + Submit content
            </a>
          </div>
          {items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No content submitted yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {items.map((item) => {
                const audit = audits[item.id];
                return (
                  <li key={item.id} className="rounded border border-slate-200 p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-medium">{item.title}</p>
                        <p className="text-xs text-slate-500">
                          {item.category} · {item.language} · moderation: {item.status} · rights:{" "}
                          {item.rights_status}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2">
                      {!audit?.job ? (
                        <RunAuditButton contentItemId={item.id} />
                      ) : audit.job.status === "succeeded" && audit.result ? (
                        <div className="text-sm">
                          <p>
                            <span className="font-medium">Audit:</span> quality score{" "}
                            {audit.result.quality_score} — {audit.result.summary}
                          </p>
                        </div>
                      ) : audit.job.status === "failed" ? (
                        <div className="text-sm text-red-700">
                          Audit failed: {audit.job.error_message}
                        </div>
                      ) : (
                        <div className="text-sm text-slate-600">
                          Audit {audit.job.status} (attempt {audit.job.attempts})…
                        </div>
                      )}
                    </div>
                    <div className="mt-2">
                      {item.rights_status === "LICENSING_ELIGIBLE" && (
                        <ListingButton contentItemId={item.id} mode="list" />
                      )}
                      {item.rights_status === "LISTED" && (
                        <ListingButton contentItemId={item.id} mode="unlist" />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {profile && (
        <section className="mt-8">
          <h2 className="font-medium">Requests</h2>
          {requests.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No access requests yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {requests.map((r) => (
                <li key={r.id} className="rounded border border-slate-200 p-3 text-sm">
                  <p className="font-medium">{r.contentItemTitle}</p>
                  <p className="text-xs text-slate-500">
                    from {r.buyerOrganizationName} · status: {r.status}
                  </p>
                  <p className="mt-1 text-xs text-slate-600">Intended use: {r.intended_use}</p>
                  {r.status === "pending" && <RequestActions requestId={r.id} />}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {["Active licenses", "Earnings"].map((label) => (
          <div key={label} className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{label}</p>
            <p className="mt-1">Available once that milestone ships.</p>
          </div>
        ))}
      </section>
    </div>
  );
}
