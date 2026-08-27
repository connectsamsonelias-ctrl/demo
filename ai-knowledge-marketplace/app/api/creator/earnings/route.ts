import { requireRole } from "@/lib/auth/authorize";
import { getEarningsSummaryForCreator, listEarningsForCreator } from "@/lib/creator/earnings";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const [summary, entries] = await Promise.all([
      getEarningsSummaryForCreator(session),
      listEarningsForCreator(session),
    ]);
    return Response.json({ summary, entries });
  } catch (err) {
    return toApiResponse(err);
  }
}
