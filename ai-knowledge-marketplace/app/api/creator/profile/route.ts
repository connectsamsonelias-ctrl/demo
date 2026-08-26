import { parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { getCreatorProfile, upsertCreatorProfile, creatorProfileSchema } from "@/lib/creator/profile";
import { toApiResponse, NotFoundError } from "@/lib/errors";

// Reads/writes the caller's own session-scoped row on every request —
// must never be statically prerendered (same reasoning as /api/auth/me).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const profile = await getCreatorProfile(session.userId);
    if (!profile) throw new NotFoundError("Creator profile not found — complete profile setup first");
    return Response.json({ profile });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const body = parseOrThrow(creatorProfileSchema, await request.json());
    const profile = await upsertCreatorProfile(session.userId, body);
    return Response.json({ profile });
  } catch (err) {
    return toApiResponse(err);
  }
}
