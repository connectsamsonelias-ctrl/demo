import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth/session";
import { getBuyerProfile } from "@/lib/buyer/profile";
import { listAccessRequestsForBuyer } from "@/lib/buyer/requests";
import { listLicensesForBuyer } from "@/lib/buyer/licenses";
import { SignOutButton } from "./sign-out-button";
import { PayNowButton } from "./pay-now-button";

export const dynamic = "force-dynamic";

/**
 * Screen B05 (Buyer Dashboard). Requests (Milestone 12), Licenses
 * (Milestone 14), and now real Stripe checkout (Milestone 15) for any
 * `pending_payment` license. "Downloads/access" and "Saved assets"
 * remain honest placeholders: downloadable access to licensed content
 * has no backing implementation anywhere yet (not this milestone's
 * scope — payment activates a license, it doesn't define what "access"
 * concretely delivers), and "Saved assets" has no backing table at all
 * in the schema — that would be a new bookmarking feature, not payments.
 */
export default async function BuyerDashboardPage() {
  const session = await getPageSession();
  if (!session) redirect("/signin");
  if (session.role !== "buyer") redirect("/");

  const profile = await getBuyerProfile(session.userId);
  const requests = profile ? await listAccessRequestsForBuyer(session) : [];
  const licenses = profile ? await listLicensesForBuyer(session) : [];

  return (
    <div className="max-w-3xl">
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
            {profile.industry ? ` · ${profile.industry}` : ""} · verification:{" "}
            {profile.verification_status}
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
    </div>
  );
}
