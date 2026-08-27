import { requireRole } from "@/lib/auth/authorize";
import { getPlatformAnalytics } from "@/lib/admin/analytics";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["admin"]);
    const analytics = await getPlatformAnalytics(session);
    return Response.json(analytics);
  } catch (err) {
    return toApiResponse(err);
  }
}
