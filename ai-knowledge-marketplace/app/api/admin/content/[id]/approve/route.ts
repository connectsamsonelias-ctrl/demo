import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { approveContent } from "@/lib/admin/content";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const parsed = idSchema.safeParse(params.id);
    if (!parsed.success) throw new NotFoundError("Content item not found");
    const item = await approveContent(session, parsed.data);
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}
