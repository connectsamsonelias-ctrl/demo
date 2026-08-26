import { query } from "@/lib/db/pool";
import { toApiResponse } from "@/lib/errors";

/**
 * Sanity-check endpoint proving the DB connection layer and error-handling
 * strategy are wired end to end. Not a real product route. Must never be
 * statically prerendered at build time — it always needs a live DB check.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await query("SELECT 1");
    return Response.json({ status: "ok" });
  } catch (err) {
    return toApiResponse(err);
  }
}
