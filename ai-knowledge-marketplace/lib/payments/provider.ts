import Stripe from "stripe";
import { getEnv } from "@/lib/env";
import { StripePaymentProvider } from "@/lib/payments/stripe-provider";
import type { CheckoutSessionInput, CheckoutSessionResult, PaymentWebhookEvent } from "@/lib/payments/types";

export interface CheckoutCreator {
  createCheckoutSession(input: CheckoutSessionInput): Promise<CheckoutSessionResult>;
}

export interface WebhookVerifier {
  /** Verifies the webhook signature and parses the payload. Throws on an invalid/unverifiable signature. */
  constructWebhookEvent(rawBody: string, signatureHeader: string): PaymentWebhookEvent;
}

/**
 * Default when Stripe isn't configured for the relevant capability.
 * Deliberately throws rather than returning a fabricated checkout URL or
 * silently accepting an unverified webhook — same fail-closed reasoning
 * as lib/ai/provider.ts's NotConfiguredAIProvider. A payment confirmation
 * must never be accepted without real signature verification.
 */
export class NotConfiguredPaymentProvider implements CheckoutCreator, WebhookVerifier {
  async createCheckoutSession(): Promise<CheckoutSessionResult> {
    throw new Error("No payment provider is configured (STRIPE_SECRET_KEY is not set). Set it to enable checkout.");
  }
  constructWebhookEvent(): PaymentWebhookEvent {
    throw new Error(
      "No payment provider is configured (STRIPE_WEBHOOK_SECRET is not set) — refusing to process an unverifiable webhook."
    );
  }
}

let checkoutOverride: CheckoutCreator | null = null;
let webhookOverride: WebhookVerifier | null = null;

/** Test/dev override for checkout creation (the capability that needs a live Stripe API call). Pass null to clear. */
export function setCheckoutProvider(p: CheckoutCreator | null): void {
  checkoutOverride = p;
}

/**
 * Test/dev override for webhook verification. Deliberately independent
 * from setCheckoutProvider: STRIPE_WEBHOOK_SECRET alone is enough to
 * verify and process a real webhook even when STRIPE_SECRET_KEY (needed
 * only to *create* a checkout session) is unset — a deployment can
 * receive and act on Stripe-confirmed payments without ever calling the
 * Stripe API itself. Pass null to clear.
 */
export function setWebhookProvider(p: WebhookVerifier | null): void {
  webhookOverride = p;
}

/** Resolves fresh from STRIPE_SECRET_KEY on every call (unless overridden) — see getAIAuditProvider() for the same reasoning. */
export function getCheckoutProvider(): CheckoutCreator {
  if (checkoutOverride) return checkoutOverride;
  const secretKey = getEnv().STRIPE_SECRET_KEY;
  return secretKey ? new StripePaymentProvider(new Stripe(secretKey)) : new NotConfiguredPaymentProvider();
}

/** Resolves fresh from STRIPE_WEBHOOK_SECRET on every call (unless overridden). No Stripe API client/network call needed — signature verification is local HMAC. */
export function getWebhookVerifier(): WebhookVerifier {
  if (webhookOverride) return webhookOverride;
  const webhookSecret = getEnv().STRIPE_WEBHOOK_SECRET;
  return webhookSecret ? new StripePaymentProvider(undefined, webhookSecret) : new NotConfiguredPaymentProvider();
}
