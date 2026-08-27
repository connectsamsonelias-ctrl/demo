import { requireRole } from "@/lib/auth/authorize";
import { listUsersForReview } from "@/lib/admin/users";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["admin"]);
    const users = await listUsersForReview(session);
    return Response.json({ users });
  } catch (err) {
    return toApiResponse(err);
  }
}
