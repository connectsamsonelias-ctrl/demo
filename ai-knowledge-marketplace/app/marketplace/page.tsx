import { listMarketplaceItems, marketplaceFiltersSchema } from "@/lib/marketplace";

export const dynamic = "force-dynamic";

/**
 * Screen P03 (Marketplace). Filters submit via a plain GET form — no
 * client JS required, and the resulting URL is shareable/bookmarkable.
 * Invalid filter values (e.g. minQuality out of range) are simply
 * dropped by parseFilters below rather than erroring the page — a
 * malformed query string shouldn't break browsing.
 */
function parseFilters(searchParams: Record<string, string | string[] | undefined>) {
  const flat = Object.fromEntries(
    Object.entries(searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v])
  );
  const result = marketplaceFiltersSchema.safeParse(flat);
  return result.success ? result.data : {};
}

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const filters = parseFilters(searchParams);
  const items = await listMarketplaceItems(filters);

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-semibold">Marketplace</h1>
      <p className="mt-1 text-sm text-slate-600">Rights-cleared knowledge listed by creators.</p>

      <form method="get" className="mt-4 flex flex-wrap gap-2 text-sm">
        <input
          name="q"
          defaultValue={filters.q ?? ""}
          placeholder="Search title/description"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          name="category"
          defaultValue={filters.category ?? ""}
          placeholder="Category"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          name="language"
          defaultValue={filters.language ?? ""}
          placeholder="Language"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          name="topic"
          defaultValue={filters.topic ?? ""}
          placeholder="Topic"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          name="skill"
          defaultValue={filters.skill ?? ""}
          placeholder="Skill"
          className="rounded border border-slate-300 px-2 py-1"
        />
        <input
          name="minQuality"
          type="number"
          min={0}
          max={100}
          defaultValue={filters.minQuality ?? ""}
          placeholder="Min quality"
          className="w-28 rounded border border-slate-300 px-2 py-1"
        />
        <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-white">
          Search
        </button>
        {Object.keys(filters).length > 0 && (
          <a href="/marketplace" className="self-center underline">
            Clear
          </a>
        )}
      </form>

      {items.length === 0 ? (
        <p className="mt-6 text-sm text-slate-600">
          {Object.keys(filters).length > 0 ? "No listings match these filters." : "Nothing listed yet."}
        </p>
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
