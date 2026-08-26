import { listMarketplaceItems } from "@/lib/marketplace";
import { toApiResponse } from "@/lib/errors";

// Public, unauthenticated — visibility is bounded by the query itself
// (rights_status = 'LISTED'), not by any auth check.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const items = await listMarketplaceItems();
    return Response.json({ items });
  } catch (err) {
    return toApiResponse(err);
  }
}
