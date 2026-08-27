import { handlePaymentWebhook } from "@/lib/payments/webhook";

export const dynamic = "force-dynamic";

/**
 * Stripe webhook endpoint — no session/role auth (Stripe itself is the
 * caller), authenticated instead by verifying the `Stripe-Signature`
 * header against STRIPE_WEBHOOK_SECRET inside handlePaymentWebhook. The
 * raw body text is required for signature verification — never
 * `request.json()` here, which would re-serialize the body and break the
 * signature.
 */
export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return Response.json({ error: { code: "validation_error", message: "Missing Stripe-Signature header" } }, { status: 400 });
  }

  const rawBody = await request.text();

  try {
    const result = await handlePaymentWebhook(rawBody, signature);
    return Response.json({ handled: result.handled });
  } catch (err) {
    // Deliberately generic and always a 400, whether the cause is an
    // invalid signature, a stale timestamp, or the provider being
    // unconfigured — never process, and never describe, an unverifiable
    // payload. Details go to server logs, not the response.
    console.error("Payment webhook rejected:", err);
    return Response.json(
      { error: { code: "validation_error", message: "Webhook signature verification failed" } },
      { status: 400 }
    );
  }
}
