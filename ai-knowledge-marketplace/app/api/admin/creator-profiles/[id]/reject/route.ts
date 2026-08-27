import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { rejectCreatorProfile } from "@/lib/admin/verification";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["admin"]);
    const parsed = idSchema.safeParse(params.id);
    if (!parsed.success) throw new NotFoundError("Profile not found");
    const profile = await rejectCreatorProfile(session, parsed.data);
    return Response.json({ profile });
  } catch (err) {
    return toApiResponse(err);
  }
}
