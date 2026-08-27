import { z, parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { suspendContent } from "@/lib/admin/content";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const bodySchema = z.object({ reason: z.string().trim().max(2000).optional() });

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const parsed = idSchema.safeParse(params.id);
    if (!parsed.success) throw new NotFoundError("Content item not found");
    const body = parseOrThrow(bodySchema, await request.json().catch(() => ({})));
    const item = await suspendContent(session, parsed.data, body.reason);
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}
