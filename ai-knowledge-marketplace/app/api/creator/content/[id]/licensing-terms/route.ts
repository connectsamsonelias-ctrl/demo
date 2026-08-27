import { z, parseOrThrow } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import {
  getLicensingTermsForCreator,
  setLicensingTerms,
  licensingTermsSchema,
} from "@/lib/creator/licensing-terms";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

function parseId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) throw new NotFoundError("Content item not found");
  return result.data;
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const terms = await getLicensingTermsForCreator(session, parseId(params.id));
    return Response.json({ terms });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const body = parseOrThrow(licensingTermsSchema, await request.json());
    const terms = await setLicensingTerms(session, parseId(params.id), body);
    return Response.json({ terms });
  } catch (err) {
    return toApiResponse(err);
  }
}
