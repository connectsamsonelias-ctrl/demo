import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { listContentOnMarketplace, unlistContentFromMarketplace } from "@/lib/creator/listing";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

function parseId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) throw new NotFoundError("Content item not found");
  return result.data;
}

/** Creates the "listing" — moves rights_status SUBMITTED -> LISTED. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const item = await listContentOnMarketplace(session, parseId(params.id));
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}

/** Removes the listing — moves rights_status LISTED -> WITHDRAWN. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const item = await unlistContentFromMarketplace(session, parseId(params.id));
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}
