import { parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { createAccessRequest, listAccessRequestsForBuyer, accessRequestSchema } from "@/lib/buyer/requests";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["buyer"]);
    const requests = await listAccessRequestsForBuyer(session);
    return Response.json({ requests });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(request, ["buyer"]);
    const body = parseOrThrow(accessRequestSchema, await request.json());
    const accessRequest = await createAccessRequest(session, body);
    return Response.json({ request: accessRequest }, { status: 201 });
  } catch (err) {
    return toApiResponse(err);
  }
}
