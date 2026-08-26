import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { requestAudit, getLatestAudit } from "@/lib/creator/audit";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

function parseId(id: string): string {
  const result = idSchema.safeParse(id);
  if (!result.success) throw new NotFoundError("Content item not found");
  return result.data;
}

/**
 * Never calls the AI provider inline — only enqueues a job and returns
 * immediately (202), per the spec's rule that AI processing must never
 * block an HTTP request. The actual work happens in
 * workers/audit/processor.ts, run via `npm run worker:audit`.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const job = await requestAudit(session, parseId(params.id));
    return Response.json({ job }, { status: 202 });
  } catch (err) {
    return toApiResponse(err);
  }
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["creator"]);
    const status = await getLatestAudit(session, parseId(params.id));
    if (!status.job) throw new NotFoundError("No audit has been requested for this content item yet");
    return Response.json(status);
  } catch (err) {
    return toApiResponse(err);
  }
}
