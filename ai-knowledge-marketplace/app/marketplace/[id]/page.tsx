import { notFound } from "next/navigation";
import { getMarketplaceItem } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

function List({ label, values }: { label: string; values: unknown[] }) {
  if (values.length === 0) return null;
  return (
    <div>
      <span className="font-medium">{label}:</span> {values.join(", ")}
    </div>
  );
}

/** Screen P04 (Asset Detail). */
export default async function MarketplaceItemPage({ params }: { params: { id: string } }) {
  const item = await getMarketplaceItem(params.id);
  if (!item) notFound();

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

      <div className="mt-6 rounded border border-dashed border-slate-300 p-4 text-sm text-slate-500">
        <p className="font-medium text-slate-700">Licensing &amp; access requests</p>
        <p className="mt-1">Pricing and &quot;Request access&quot; are available once those milestones ship.</p>
      </div>
    </div>
  );
}
