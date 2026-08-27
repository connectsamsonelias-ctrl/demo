import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth/session";
import { listContentForModeration } from "@/lib/admin/content";
import { listUsersForReview } from "@/lib/admin/users";
import { listCreatorProfilesForReview, listBuyerProfilesForReview } from "@/lib/admin/verification";
import { SignOutButton } from "./sign-out-button";
import { ActionButton } from "./action-button";

export const dynamic = "force-dynamic";

/**
 * Screen A02/A03 (Admin Dashboard). The moderation queue (pending_review
 * content, Milestone 17), the user list (Milestone 17), and the
 * creator/buyer verification queue (Milestone 18 — closes the gap
 * lib/creator/profile.ts and lib/buyer/profile.ts both flagged since
 * Milestones 5/11) are all real, queried directly (Server Component ->
 * lib call, no self-fetch round trip). Broader "review everything"
 * panels for access requests/licenses/transactions (the `*.review_any`
 * capabilities already in lib/auth/permissions.ts) remain deliberately
 * not built — see the Milestone 17 README section for why.
 */
export default async function AdminDashboardPage() {
  const session = await getPageSession();
  if (!session) redirect("/signin");
  if (session.role !== "admin") redirect("/");

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
    <div className="max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin dashboard</h1>
        <SignOutButton />
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
                  <ActionButton
                    url={`/api/admin/content/${item.id}/approve`}
                    label="Approve"
                    loadingLabel="Approving…"
                  />
                  <ActionButton
                    url={`/api/admin/content/${item.id}/reject`}
                    label="Reject"
                    loadingLabel="Rejecting…"
                  />
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
                  <ActionButton
                    url={`/api/admin/creator-profiles/${p.id}/verify`}
                    label="Verify"
                    loadingLabel="Verifying…"
                  />
                  <ActionButton
                    url={`/api/admin/creator-profiles/${p.id}/reject`}
                    label="Reject"
                    loadingLabel="Rejecting…"
                  />
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
                  <ActionButton
                    url={`/api/admin/buyer-profiles/${p.id}/verify`}
                    label="Verify"
                    loadingLabel="Verifying…"
                  />
                  <ActionButton
                    url={`/api/admin/buyer-profiles/${p.id}/reject`}
                    label="Reject"
                    loadingLabel="Rejecting…"
                  />
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
                    <ActionButton
                      url={`/api/admin/users/${u.id}/suspend`}
                      label="Suspend"
                      loadingLabel="Suspending…"
                    />
                  ) : (
                    <ActionButton
                      url={`/api/admin/users/${u.id}/reinstate`}
                      label="Reinstate"
                      loadingLabel="Reinstating…"
                    />
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
