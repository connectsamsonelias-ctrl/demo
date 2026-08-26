import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { rejectAccessRequest } from "@/lib/creator/requests";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const parsed = idSchema.safeParse(params.id);
    if (!parsed.success) throw new NotFoundError("Access request not found");
    const accessRequest = await rejectAccessRequest(session, parsed.data);
    return Response.json({ request: accessRequest });
  } catch (err) {
    return toApiResponse(err);
  }
}
