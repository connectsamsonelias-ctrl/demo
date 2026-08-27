import { requireRole } from "@/lib/auth/authorize";
import { listLicensesForBuyer } from "@/lib/buyer/licenses";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["buyer"]);
    const licenses = await listLicensesForBuyer(session);
    return Response.json({ licenses });
  } catch (err) {
    return toApiResponse(err);
  }
}
