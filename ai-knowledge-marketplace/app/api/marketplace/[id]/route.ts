import { z } from "@/lib/validation";
import { getMarketplaceItem } from "@/lib/marketplace";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  try {
    const parsed = idSchema.safeParse(params.id);
    if (!parsed.success) throw new NotFoundError("Listing not found");
    const item = await getMarketplaceItem(parsed.data);
    if (!item) throw new NotFoundError("Listing not found");
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}
