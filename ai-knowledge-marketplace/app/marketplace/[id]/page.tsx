import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getMarketplaceItem } from "@/lib/marketplace";
import { getPageSession } from "@/lib/auth/session";
import { getBuyerProfile } from "@/lib/buyer/profile";
import { getOwnAccessRequestForContent } from "@/lib/buyer/requests";
import { RequestAccessForm } from "./request-access-form";

export const dynamic = "force-dynamic";

/**
 * Real per-listing SEO: each of these pages is effectively a public
 * "product page" for one piece of licensable knowledge, so it gets its
 * own title/description/OG tags from the actual content rather than
 * inheriting the site-wide default. Returns the parent's metadata
 * (via `notFound()` triggering the nearest not-found boundary) for an
 * unlisted/nonexistent id — same public-facing behavior as the page
 * component itself, just for the <head> instead of the body.
 */
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const item = await getMarketplaceItem(params.id);
  if (!item) return {};
  const description =
    item.description ?? item.qualitySummary ?? `${item.category} content licensed by ${item.creatorDisplayName}.`;
  return {
    title: item.title,
    description,
    openGraph: { title: item.title, description, type: "website" },
    twitter: { card: "summary", title: item.title, description },
  };
}

function List({ label, values }: { label: string; values: unknown[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <span className="font-medium">{label}:</span> {values.join(", ")}
    </div>
  );
}

/**
 * Screen P04 (Asset Detail). The "Request access" section (B04) is real —
 * it submits an actual access_requests row via Milestone 12. Licensing
 * terms/pricing (Milestone 14) are now real too, fixed in Milestone 20
 * after review found this page still showing a stale "available once
 * that milestone ships" placeholder five milestones after it shipped.
 */
export default async function MarketplaceItemPage({ params }: { params: { id: string } }) {
  const item = await getMarketplaceItem(params.id);
  if (!item) notFound();

  const session = await getPageSession();

  let accessSection: React.ReactNode;
  if (!session) {
    accessSection = (
      <p>
        <a href="/signin" className="underline">
          Sign in
        </a>{" "}
        as a buyer to request access.
      </p>
    );
  } else if (session.role !== "buyer") {
    accessSection = <p className="text-slate-500">Only buyer accounts can request access.</p>;
  } else {
    const profile = await getBuyerProfile(session.userId);
    if (!profile) {
      accessSection = (
        <p>
          <a href="/buyer/profile/edit" className="underline">
            Complete your buyer profile
          </a>{" "}
          to request access.
        </p>
      );
    } else {
      const existing = await getOwnAccessRequestForContent(session, item.id);
      if (!existing) {
        accessSection = <RequestAccessForm contentItemId={item.id} />;
      } else {
        accessSection = (
          <p>
            Your request status: <span className="font-medium">{existing.status}</span>
          </p>
        );
      }
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold">{item.title}</h1>
      <p className="text-sm text-slate-500">
        by {item.creatorDisplayName} · {item.category} · {item.language}
      </p>
      {item.description && <p className="mt-3">{item.description}</p>}

      <div className="mt-6 flex flex-col gap-2 text-sm">
        <List label="Topics" values={item.topics} />
        <List label="Skills" values={item.skills} />
        <List label="Entities" values={item.entities} />
        <List label="Potential use cases" values={item.potentialUseCases} />
        {item.qualityScore && (
          <div>
            <span className="font-medium">Quality score:</span> {item.qualityScore}
          </div>
        )}
        {item.qualitySummary && (
          <div>
            <span className="font-medium">Summary:</span> {item.qualitySummary}
          </div>
        )}
        <div>
          <span className="font-medium">Rights status:</span> {item.rightsStatus}
        </div>
        <div>
          <span className="font-medium">Source platform:</span> {item.sourcePlatform}
        </div>
        {item.provenanceBasis === "metadata_only" && (
          <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            This audit was generated from creator-submitted metadata (title/description/category),
            not the actual video content.
          </p>
        )}
      </div>

      <div className="mt-6 rounded border border-slate-200 p-4 text-sm">
        <p className="font-medium text-slate-700">Licensing terms</p>
        {item.licensingTerms ? (
          <div className="mt-2 flex flex-col gap-1 text-slate-600">
            {item.licensingTerms.basePrice && (
              <div>
                <span className="font-medium text-slate-700">Price:</span> ${item.licensingTerms.basePrice}
                {item.licensingTerms.pricingModel ? ` (${item.licensingTerms.pricingModel})` : ""}
              </div>
            )}
            <div>
              <span className="font-medium text-slate-700">Commercial use:</span>{" "}
              {item.licensingTerms.commercialStatus === "commercial" ? "Allowed" : "Non-commercial only"}
            </div>
            {item.licensingTerms.licenseDuration && (
              <div>
                <span className="font-medium text-slate-700">Duration:</span> {item.licensingTerms.licenseDuration}
              </div>
            )}
            {item.licensingTerms.geographicScope && (
              <div>
                <span className="font-medium text-slate-700">Geographic scope:</span>{" "}
                {item.licensingTerms.geographicScope}
              </div>
            )}
            <List label="Allowed use types" values={item.licensingTerms.allowedUseTypes} />
          </div>
        ) : (
          <p className="mt-1 text-slate-500">
            The creator hasn&apos;t published commercial terms for this listing yet.
          </p>
        )}
      </div>

      <div className="mt-4 rounded border border-slate-200 p-4 text-sm">
        <p className="font-medium text-slate-700">Request access</p>
        <div className="mt-3">{accessSection}</div>
      </div>
    </div>
  );
}
