import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { listContentForModeration } from "@/lib/admin/content";
import { toApiResponse, ValidationError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const statusSchema = z.enum(["draft", "pending_review", "approved", "rejected", "suspended"]);

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["admin"]);
    const statusParam = new URL(request.url).searchParams.get("status");
    if (statusParam === null) {
      const items = await listContentForModeration(session);
      return Response.json({ items });
    }
    const parsed = statusSchema.safeParse(statusParam);
    if (!parsed.success) throw new ValidationError("Invalid status filter");
    const items = await listContentForModeration(session, parsed.data);
    return Response.json({ items });
  } catch (err) {
    return toApiResponse(err);
  }
}
