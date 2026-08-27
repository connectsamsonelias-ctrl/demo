import { describe, it, expect } from "vitest";
import Stripe from "stripe";
import { StripePaymentProvider } from "@/lib/payments/stripe-provider";

/**
 * These are real signature-verification tests, not mocked: signing and
 * verifying a Stripe webhook is local HMAC (Stripe.webhooks is a static,
 * key-less helper — see lib/payments/provider.ts), so this exercises the
 * actual `stripe` SDK end to end without any network call or live API
 * key, unlike the AI provider (which genuinely cannot be tested against
 * the real Anthropic API in this environment).
 */
const WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests_only";

function signedRequest(eventPayload: object): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(eventPayload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: rawBody,
    secret: WEBHOOK_SECRET,
  });
  return { rawBody, signature };
}

function checkoutCompletedEventPayload(overrides: {
  licenseId?: string | null;
  amountTotal?: number | null;
  paymentStatus?: string;
}) {
  return {
    id: "evt_test_123",
    object: "event",
    type: "checkout.session.completed",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: "cs_test_123",
        object: "checkout.session",
        client_reference_id: overrides.licenseId === undefined ? "license-abc" : overrides.licenseId,
        amount_total: overrides.amountTotal === undefined ? 49999 : overrides.amountTotal,
        payment_status: overrides.paymentStatus ?? "paid",
      },
    },
  };
}

describe("StripePaymentProvider.constructWebhookEvent", () => {
  it("verifies a genuinely signed payload and parses a paid checkout.session.completed event", () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    const { rawBody, signature } = signedRequest(checkoutCompletedEventPayload({}));

    const event = provider.constructWebhookEvent(rawBody, signature);
    expect(event).toEqual({
      type: "checkout.session.completed",
      sessionId: "cs_test_123",
      licenseId: "license-abc",
      amountTotalCents: 49999,
      paid: true,
    });
  });

  it("reports paid: false for an unpaid session (e.g. an async payment method still pending)", () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    const { rawBody, signature } = signedRequest(checkoutCompletedEventPayload({ paymentStatus: "unpaid" }));

    const event = provider.constructWebhookEvent(rawBody, signature);
    expect(event).toMatchObject({ paid: false });
  });

  it("throws on an invalid signature (tampered body)", () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    const { signature } = signedRequest(checkoutCompletedEventPayload({}));
    const tamperedBody = JSON.stringify(checkoutCompletedEventPayload({ amountTotal: 1 }));

    expect(() => provider.constructWebhookEvent(tamperedBody, signature)).toThrow();
  });

  it("throws when signed with a different secret", () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    const rawBody = JSON.stringify(checkoutCompletedEventPayload({}));
    const wrongSignature = Stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: "whsec_a_completely_different_secret",
    });

    expect(() => provider.constructWebhookEvent(rawBody, wrongSignature)).toThrow();
  });

  it("returns unhandled for an event type this app doesn't act on", () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    const payload = { ...checkoutCompletedEventPayload({}), type: "payment_intent.created" };
    const { rawBody, signature } = signedRequest(payload);

    const event = provider.constructWebhookEvent(rawBody, signature);
    expect(event).toEqual({ type: "unhandled", stripeEventType: "payment_intent.created" });
  });

  it("throws (never silently drops) a checkout.session.completed event with no client_reference_id", () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    const { rawBody, signature } = signedRequest(checkoutCompletedEventPayload({ licenseId: null }));

    expect(() => provider.constructWebhookEvent(rawBody, signature)).toThrow(/client_reference_id/);
  });

  it("throws when no webhook secret is configured, without attempting verification", () => {
    const provider = new StripePaymentProvider(undefined, undefined);
    expect(() => provider.constructWebhookEvent("{}", "irrelevant")).toThrow(/STRIPE_WEBHOOK_SECRET/);
  });
});

describe("StripePaymentProvider.createCheckoutSession", () => {
  it("throws when no Stripe client is configured, without attempting a network call", async () => {
    const provider = new StripePaymentProvider(undefined, WEBHOOK_SECRET);
    await expect(
      provider.createCheckoutSession({
        licenseId: "license-abc",
        amountCents: 1000,
        productName: "Test content",
        successUrl: "https://example.com/success",
        cancelUrl: "https://example.com/cancel",
      })
    ).rejects.toThrow(/STRIPE_SECRET_KEY/);
  });
});
