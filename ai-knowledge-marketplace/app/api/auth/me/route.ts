import { getSession } from "@/lib/auth/session";
import { toApiResponse, UnauthorizedError } from "@/lib/errors";

// Reads the session cookie on every request — must never be statically
// prerendered at build time (same reasoning as /api/health).
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await getSession(request);
    if (!session) throw new UnauthorizedError();
    return Response.json({ user: session });
  } catch (err) {
    return toApiResponse(err);
  }
}
