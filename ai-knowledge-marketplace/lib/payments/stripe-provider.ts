import Stripe from "stripe";
import type { CheckoutCreator, WebhookVerifier } from "@/lib/payments/provider";
import { PAYMENT_CURRENCY, type CheckoutSessionInput, type CheckoutSessionResult, type PaymentWebhookEvent } from "@/lib/payments/types";

/** The slice of the Stripe client checkout creation actually needs — narrow on purpose so tests can pass a fake without constructing a real SDK client. */
export type CheckoutClient = Pick<Stripe, "checkout">;

/**
 * Real Stripe integration. Split into two independently-usable pieces
 * (see lib/payments/provider.ts): pass `client` to create checkout
 * sessions, `webhookSecret` to verify webhooks — `Stripe.webhooks` is a
 * static, key-less HMAC check, so verifying a webhook never needs a live
 * Stripe API client at all.
 */
export class StripePaymentProvider implements CheckoutCreator, WebhookVerifier {
  constructor(
    private client?: CheckoutClient,
    private webhookSecret?: string
  ) {}

  async createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult> {
    if (!this.client) {
      throw new Error("No payment provider is configured (STRIPE_SECRET_KEY is not set). Set it to enable checkout.");
    }
    const session = await this.client.checkout.sessions.create({
      mode: "payment",
      client_reference_id: input.licenseId,
      metadata: { license_id: input.licenseId },
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: PAYMENT_CURRENCY,
            unit_amount: input.amountCents,
            product_data: { name: input.productName },
          },
        },
      ],
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    });
    if (!session.url) {
      throw new Error("Stripe did not return a checkout URL for this session");
    }
    return { checkoutUrl: session.url };
  }

  constructWebhookEvent(rawBody: string, signatureHeader: string): PaymentWebhookEvent {
    if (!this.webhookSecret) {
      throw new Error(
        "No payment provider is configured (STRIPE_WEBHOOK_SECRET is not set) — refusing to process an unverifiable webhook."
      );
    }
    // Throws Stripe.errors.StripeSignatureVerificationError on any
    // mismatch (wrong secret, tampered body, stale timestamp) — that
    // throw is intentionally left uncaught here so the webhook route
    // returns a clean 400 rather than ever treating an unverified
    // payload as real.
    const event = Stripe.webhooks.constructEvent(rawBody, signatureHeader, this.webhookSecret);

    if (event.type !== "checkout.session.completed") {
      return { type: "unhandled", stripeEventType: event.type };
    }
    const session = event.data.object as Stripe.Checkout.Session;
    const licenseId = session.client_reference_id;
    if (!licenseId) {
      // Should never happen for a session this app created (we always set
      // client_reference_id), but a malformed/foreign session must never
      // be silently treated as "unhandled" and dropped — that would hide
      // a real integration bug.
      throw new Error(`checkout.session.completed event ${event.id} has no client_reference_id`);
    }
    return {
      type: "checkout.session.completed",
      sessionId: session.id,
      licenseId,
      amountTotalCents: session.amount_total,
      paid: session.payment_status === "paid",
    };
  }
}
