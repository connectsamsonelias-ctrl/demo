import { parseOrThrow } from "@/lib/validation";
import { listMarketplaceItems, marketplaceFiltersSchema } from "@/lib/marketplace";
import { toApiResponse } from "@/lib/errors";

// Public, unauthenticated — visibility is bounded by the query itself
// (rights_status = 'LISTED'), not by any auth check.
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const filters = parseOrThrow(marketplaceFiltersSchema, Object.fromEntries(searchParams));
    const items = await listMarketplaceItems(filters);
    return Response.json({ items });
  } catch (err) {
    return toApiResponse(err);
  }
}
