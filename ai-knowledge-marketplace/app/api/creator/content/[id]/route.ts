import { z, parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { getContentItemForCreator, updateContentItem, contentUpdateSchema } from "@/lib/creator/content";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

function parseId(id: string): string {
  const result = idSchema.safeParse(id);
  // A malformed id can never match a real row — treat it the same as
  // "not found" rather than letting an invalid UUID reach Postgres and
  // surface as a generic 500.
  if (!result.success) throw new NotFoundError("Content item not found");
  return result.data;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const item = await getContentItemForCreator(session, parseId(params.id));
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const body = parseOrThrow(contentUpdateSchema, await request.json());
    const item = await updateContentItem(session, parseId(params.id), body);
    return Response.json({ item });
  } catch (err) {
    return toApiResponse(err);
  }
}
