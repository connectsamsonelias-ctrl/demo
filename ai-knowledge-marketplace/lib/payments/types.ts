/**
 * App-level payment types, deliberately narrow — code outside
 * lib/payments/ never sees a raw Stripe object, same reasoning as
 * lib/ai/types.ts narrowing the AI provider's surface.
 *
 * Single global currency for V1: USD only. The spec flags "supported
 * countries/currencies" as part of the same business decision as the
 * provider choice itself; the provider was confirmed explicitly with the
 * user, but a specific currency/jurisdiction scope wasn't asked
 * separately — USD-only, worldwide, is the smallest reasonable MVP
 * assumption (matches every other MVP-scope simplification in this
 * codebase, e.g. content_items.language defaulting to a single free-text
 * value with no i18n). Revisit explicitly before any real multi-currency
 * launch.
 */
export const PAYMENT_CURRENCY = "usd";

export interface CheckoutSessionInput {
  licenseId: string;
  /** Integer minor units (cents) — never a float, to avoid rounding drift. */
  amountCents: number;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResult {
  checkoutUrl: string;
}

/**
 * Result of verifying + parsing a webhook payload. Only the one event
 * type this app currently acts on is modeled explicitly; everything else
 * collapses to "unhandled" so callers can't accidentally branch on a
 * Stripe event shape this app was never designed against.
 */
export type PaymentWebhookEvent =
  | {
      type: "checkout.session.completed";
      sessionId: string;
      licenseId: string;
      amountTotalCents: number | null;
      paid: boolean;
    }
  | { type: "unhandled"; stripeEventType: string };
