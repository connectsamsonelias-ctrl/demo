import { parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { getBuyerProfile, upsertBuyerProfile, buyerProfileSchema } from "@/lib/buyer/profile";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["buyer"]);
    const profile = await getBuyerProfile(session.userId);
    if (!profile) throw new NotFoundError("Buyer profile not found — complete profile setup first");
    return Response.json({ profile });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireRole(request, ["buyer"]);
    const body = parseOrThrow(buyerProfileSchema, await request.json());
    const profile = await upsertBuyerProfile(session.userId, body);
    return Response.json({ profile });
  } catch (err) {
    return toApiResponse(err);
  }
}
