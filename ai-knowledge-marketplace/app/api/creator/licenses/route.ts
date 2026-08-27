import { requireRole } from "@/lib/auth/authorize";
import { listLicensesForCreator } from "@/lib/creator/licenses";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const licenses = await listLicensesForCreator(session);
    return Response.json({ licenses });
  } catch (err) {
    return toApiResponse(err);
  }
}
