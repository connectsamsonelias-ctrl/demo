import { listMarketplaceItems } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

/**
 * Screen P03 (Marketplace). Filters (topic/industry/skill/language/
 * quality/rights type/license availability) are explicitly Milestone 10
 * scope, not this one — this is the bare listing only.
 */
export default async function MarketplacePage() {
  const items = await listMarketplaceItems();

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Marketplace</h1>
      <p className="mt-1 text-sm text-slate-600">
        Rights-cleared knowledge listed by creators. Search and filtering are a later milestone —
        this shows every listed item.
      </p>
      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">Nothing listed yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id} className="rounded border border-slate-200 p-4">
              <a href={`/marketplace/${item.id}`} className="font-medium underline">
                {item.title}
              </a>
              <p className="text-xs text-slate-500">
                {item.category} · {item.language} · by {item.creatorDisplayName}
                {item.qualityScore ? ` · quality ${item.qualityScore}` : ""}
              </p>
              {item.qualitySummary && <p className="mt-1 text-sm text-slate-700">{item.qualitySummary}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
