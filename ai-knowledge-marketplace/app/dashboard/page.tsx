import { redirect } from "next/navigation";
import { getPageSession, type Session } from "@/lib/auth/session";
import { getCreatorProfile } from "@/lib/creator/profile";
import { listContentItemsForCreator } from "@/lib/creator/content";
import { getLatestAudit, type AuditStatus } from "@/lib/creator/audit";
import { listAccessRequestsForCreator } from "@/lib/creator/requests";
import { listLicensesForCreator } from "@/lib/creator/licenses";
import { getEarningsSummaryForCreator, listEarningsForCreator } from "@/lib/creator/earnings";
import { getBuyerProfile } from "@/lib/buyer/profile";
import { listAccessRequestsForBuyer } from "@/lib/buyer/requests";
import { listLicensesForBuyer } from "@/lib/buyer/licenses";
import { listContentForModeration } from "@/lib/admin/content";
import { listUsersForReview } from "@/lib/admin/users";
import { listCreatorProfilesForReview, listBuyerProfilesForReview } from "@/lib/admin/verification";
import type { ContentItemRow } from "@/lib/db/types";
import { SignOutButton } from "./sign-out-button";
import { RunAuditButton } from "./run-audit-button";
import { ListingButton } from "./listing-button";
import { RequestActions } from "./request-actions";
import { PayNowButton } from "./pay-now-button";
import { ActionButton } from "./action-button";

export const dynamic = "force-dynamic";

/**
 * A single dashboard entry point for every role, replacing the three
 * separate /creator/dashboard, /buyer/dashboard, /admin/dashboard pages
 * (those now just redirect here). One URL; the content shown — and the
 * mutations available — is entirely driven by the signed-in session's
 * role. Nothing about *what* each role can see or do changed: this page
 * calls exactly the same lib functions the three original pages did.
 *
 * This also fixes a real, latent bug: app/signin/page.tsx unconditionally
 * pushed every successful sign-in to `/creator/dashboard`, which then
 * redirected non-creators to `/` — a buyer or admin signing in landed on
 * the marketing placeholder, not their own dashboard. Signin now pushes
 * here instead, and role-branching happens in one place.
 */
export default async function DashboardPage() {
  const session = await getPageSession();
  if (!session) redirect("/signin");

  return (
    <div className="max-w-3xl">
      {session.role === "creator" && <CreatorDashboard userId={session.userId} session={session} />}
      {session.role === "buyer" && <BuyerDashboard userId={session.userId} session={session} />}
      {session.role === "admin" && <AdminDashboard session={session} />}
    </div>
  );
}

async function CreatorDashboard({ userId, session }: { userId: string; session: Session }) {
  const profile = await getCreatorProfile(userId);

  let items: ContentItemRow[] = [];
  let audits: Record<string, AuditStatus> = {};
  let requests: Awaited<ReturnType<typeof listAccessRequestsForCreator>> = [];
  let licenses: Awaited<ReturnType<typeof listLicensesForCreator>> = [];
  let earningsSummary: Awaited<ReturnType<typeof getEarningsSummaryForCreator>> | null = null;
  let earningsEntries: Awaited<ReturnType<typeof listEarningsForCreator>> = [];
  if (profile) {
    items = await listContentItemsForCreator(session);
    const entries = await Promise.all(
      items.map(async (item) => [item.id, await getLatestAudit(session, item.id)] as const)
    );
    audits = Object.fromEntries(entries);
    requests = await listAccessRequestsForCreator(session);
    licenses = await listLicensesForCreator(session);
    earningsSummary = await getEarningsSummaryForCreator(session);
    earningsEntries = await listEarningsForCreator(session);
  }

  return (
    <>
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
                        <div className="text-sm text-red-700">Audit failed: {audit.job.error_message}</div>
                      ) : (
                        <div className="text-sm text-slate-600">
                          Audit {audit.job.status} (attempt {audit.job.attempts})…
                        </div>
                      )}
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      {item.rights_status === "LICENSING_ELIGIBLE" && (
                        <ListingButton contentItemId={item.id} mode="list" />
                      )}
                      {item.rights_status === "LISTED" && <ListingButton contentItemId={item.id} mode="unlist" />}
                      <a href={`/creator/content/${item.id}/licensing-terms`} className="text-sm underline">
                        Licensing terms
                      </a>
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

      {profile && (
        <section className="mt-8">
          <h2 className="font-medium">Licenses</h2>
          {licenses.length === 0 ? (
            <p className="mt-2 text-sm text-slate-600">No licenses yet — approve a request to create one.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {licenses.map((l) => (
                <li key={l.id} className="rounded border border-slate-200 p-3 text-sm">
                  <p className="font-medium">{l.contentItemTitle}</p>
                  <p className="text-xs text-slate-500">
                    licensed to {l.buyerOrganizationName} · status: {l.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {profile && (
        <section className="mt-8">
          <h2 className="font-medium">Earnings</h2>
          <div className="mt-2 rounded border border-slate-200 p-4">
            <p className="text-2xl font-semibold">
              ${earningsSummary!.totalEarned}{" "}
              <span className="text-sm font-normal text-slate-500">{earningsSummary!.currency}</span>
            </p>
            <p className="text-xs text-slate-500">
              from {earningsSummary!.transactionCount} succeeded transaction
              {earningsSummary!.transactionCount === 1 ? "" : "s"}
            </p>
            <p className="mt-2 text-xs text-slate-500">
              This is what you&apos;ve earned, not a payout — bank transfers aren&apos;t built yet.
            </p>
          </div>
          {earningsEntries.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {earningsEntries.map((e) => (
                <li key={e.id} className="rounded border border-slate-200 p-3 text-sm">
                  <p className="font-medium">{e.contentItemTitle}</p>
                  <p className="text-xs text-slate-500">
                    from {e.buyerOrganizationName} · your share ${e.creator_amount} {e.currency} · status: {e.status}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

async function BuyerDashboard({ userId, session }: { userId: string; session: Session }) {
  const profile = await getBuyerProfile(userId);
  const requests = profile ? await listAccessRequestsForBuyer(session) : [];
  const licenses = profile ? await listLicensesForBuyer(session) : [];

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Buyer dashboard</h1>
        <SignOutButton />
      </div>

      {!profile ? (
        <div className="mt-6 rounded border border-amber-300 bg-amber-50 p-4 text-sm">
          You haven&apos;t set up your buyer profile yet.{" "}
          <a href="/buyer/profile/edit" className="underline">
            Complete your profile
          </a>{" "}
          to start requesting access to listings.
        </div>
      ) : (
        <div className="mt-6 rounded border border-slate-200 p-4 text-sm">
          <p className="font-medium">{profile.organization_name}</p>
          <p className="text-xs text-slate-500">
            {profile.organization_type}
            {profile.industry ? ` · ${profile.industry}` : ""} · verification: {profile.verification_status}
          </p>
          <a href="/buyer/profile/edit" className="mt-2 inline-block text-sm underline">
            Edit profile
          </a>
        </div>
      )}

      <div className="mt-6">
        <a href="/marketplace" className="text-sm underline">
          Browse the marketplace →
        </a>
      </div>

      <section className="mt-8">
        <h2 className="font-medium">Requests</h2>
        {requests.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No access requests yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {requests.map((r) => (
              <li key={r.id} className="rounded border border-slate-200 p-3 text-sm">
                <a href={`/marketplace/${r.content_item_id}`} className="font-medium underline">
                  {r.contentItemTitle}
                </a>
                <p className="text-xs text-slate-500">status: {r.status}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Licenses</h2>
        {licenses.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No licenses yet.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {licenses.map((l) => (
              <li key={l.id} className="rounded border border-slate-200 p-3 text-sm">
                <a href={`/marketplace/${l.content_item_id}`} className="font-medium underline">
                  {l.contentItemTitle}
                </a>
                <p className="text-xs text-slate-500">status: {l.status}</p>
                {l.status === "pending_payment" && <PayNowButton licenseId={l.id} />}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Payments", "Downloads/access", "Saved assets"].map((label) => (
          <div key={label} className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{label}</p>
            <p className="mt-1">Available once that milestone ships.</p>
          </div>
        ))}
      </section>
    </>
  );
}

async function AdminDashboard({ session }: { session: Session }) {
  const pendingContent = await listContentForModeration(session, "pending_review");
  const users = await listUsersForReview(session);
  const creatorProfiles = await listCreatorProfilesForReview(session);
  const buyerProfiles = await listBuyerProfilesForReview(session);
  const unreviewedCreatorProfiles = creatorProfiles.filter(
    (p) => p.verification_status === "unverified" || p.verification_status === "pending"
  );
  const unreviewedBuyerProfiles = buyerProfiles.filter(
    (p) => p.verification_status === "unverified" || p.verification_status === "pending"
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-sm underline">
            Platform analytics
          </a>
          <SignOutButton />
        </div>
      </div>

      <section className="mt-6">
        <h2 className="font-medium">Content moderation queue</h2>
        {pendingContent.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nothing pending review.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {pendingContent.map((item) => (
              <li key={item.id} className="rounded border border-slate-200 p-3">
                <p className="font-medium">{item.title}</p>
                <p className="text-xs text-slate-500">
                  by {item.creatorDisplayName} · {item.category} · {item.language}
                </p>
                <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                <div className="mt-2 flex gap-2">
                  <ActionButton url={`/api/admin/content/${item.id}/approve`} label="Approve" loadingLabel="Approving…" />
                  <ActionButton url={`/api/admin/content/${item.id}/reject`} label="Reject" loadingLabel="Rejecting…" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Verification queue</h2>
        {unreviewedCreatorProfiles.length === 0 && unreviewedBuyerProfiles.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nothing awaiting verification.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {unreviewedCreatorProfiles.map((p) => (
              <li key={p.id} className="rounded border border-slate-200 p-3 text-sm">
                <p className="font-medium">{p.display_name}</p>
                <p className="text-xs text-slate-500">
                  creator · {p.email} · status: {p.verification_status}
                </p>
                <div className="mt-2 flex gap-2">
                  <ActionButton url={`/api/admin/creator-profiles/${p.id}/verify`} label="Verify" loadingLabel="Verifying…" />
                  <ActionButton url={`/api/admin/creator-profiles/${p.id}/reject`} label="Reject" loadingLabel="Rejecting…" />
                </div>
              </li>
            ))}
            {unreviewedBuyerProfiles.map((p) => (
              <li key={p.id} className="rounded border border-slate-200 p-3 text-sm">
                <p className="font-medium">{p.organization_name}</p>
                <p className="text-xs text-slate-500">
                  buyer · {p.email} · status: {p.verification_status}
                </p>
                <div className="mt-2 flex gap-2">
                  <ActionButton url={`/api/admin/buyer-profiles/${p.id}/verify`} label="Verify" loadingLabel="Verifying…" />
                  <ActionButton url={`/api/admin/buyer-profiles/${p.id}/reject`} label="Reject" loadingLabel="Rejecting…" />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <h2 className="font-medium">Users</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {users.map((u) => (
            <li key={u.id} className="rounded border border-slate-200 p-3 text-sm">
              <p className="font-medium">{u.email}</p>
              <p className="text-xs text-slate-500">
                role: {u.role} · status: {u.status}
              </p>
              {u.role !== "admin" && (
                <div className="mt-2">
                  {u.status === "active" ? (
                    <ActionButton url={`/api/admin/users/${u.id}/suspend`} label="Suspend" loadingLabel="Suspending…" />
                  ) : (
                    <ActionButton url={`/api/admin/users/${u.id}/reinstate`} label="Reinstate" loadingLabel="Reinstating…" />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
