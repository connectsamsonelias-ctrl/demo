import { parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { createContentItem, listContentItemsForCreator, contentSubmissionSchema } from "@/lib/creator/content";
import { toApiResponse } from "@/lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const items = await listContentItemsForCreator(session);
    return Response.json({ items });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireRole(request, ["creator"]);
    const body = parseOrThrow(contentSubmissionSchema, await request.json());
    const item = await createContentItem(session, body);
    return Response.json({ item }, { status: 201 });
  } catch (err) {
    return toApiResponse(err);
  }
}
