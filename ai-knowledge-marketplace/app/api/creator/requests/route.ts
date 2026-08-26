import { requireRole } from "@/lib/auth/authorize";
import { listAccessRequestsForCreator } from "@/lib/creator/requests";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const requests = await listAccessRequestsForCreator(session);
    return Response.json({ requests });
  } catch (err) {
    return toApiResponse(err);
  }
}
