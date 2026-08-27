import { z } from "@/lib/validation";
import { requireRole } from "@/lib/auth/authorize";
import { startCheckoutForLicense } from "@/lib/buyer/checkout";
import { toApiResponse, NotFoundError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();

/**
 * Redirect targets are computed server-side from the request's own
 * origin, never accepted from the client — an attacker-supplied
 * success/cancel URL would be an open-redirect vector on a payment flow.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireRole(request, ["buyer"]);
    const parsed = idSchema.safeParse(params.id);
    if (!parsed.success) throw new NotFoundError("License not found");

    const origin = new URL(request.url).origin;
    const { checkoutUrl } = await startCheckoutForLicense(session, parsed.data, {
      successUrl: `${origin}/buyer/dashboard?checkout=success`,
      cancelUrl: `${origin}/buyer/dashboard?checkout=cancelled`,
    });
    return Response.json({ checkoutUrl });
  } catch (err) {
    return toApiResponse(err);
  }
}
