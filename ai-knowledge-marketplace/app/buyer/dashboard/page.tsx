import { redirect } from "next/navigation";
import { getPageSession } from "@/lib/auth/session";
import { getBuyerProfile } from "@/lib/buyer/profile";
import { SignOutButton } from "./sign-out-button";

export const dynamic = "force-dynamic";

/**
 * Screen B05 (Buyer Dashboard). Requests / Active licenses / Payments /
 * Downloads / Saved assets are honest placeholders, same pattern as the
 * creator dashboard (Milestone 8): those domains (Milestones 12, 14, 15)
 * don't exist yet, and "Saved assets" specifically has no backing table
 * at all anywhere in the schema — that would be a new bookmarking
 * feature, not buyer onboarding, so it's not being added here either.
 */
export default async function BuyerDashboardPage() {
  const session = await getPageSession();
  if (!session) redirect("/signin");
  if (session.role !== "buyer") redirect("/");

  const profile = await getBuyerProfile(session.userId);

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

      <section className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {["Requests", "Active licenses", "Payments", "Downloads/access", "Saved assets"].map((label) => (
          <div key={label} className="rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{label}</p>
            <p className="mt-1">Available once that milestone ships.</p>
          </div>
        ))}
      </section>
    </div>
  );
}
