import { requireRole } from "@/lib/auth/authorize";
import { listBuyerProfilesForReview } from "@/lib/admin/verification";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["admin"]);
    const profiles = await listBuyerProfilesForReview(session);
    return Response.json({ profiles });
  } catch (err) {
    return toApiResponse(err);
  }
}
