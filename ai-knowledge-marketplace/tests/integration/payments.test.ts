import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import { setLicensingTerms } from "@/lib/creator/licensing-terms";
import { createAccessRequest } from "@/lib/buyer/requests";
import { approveAccessRequest } from "@/lib/creator/requests";
import { startCheckoutForLicense } from "@/lib/buyer/checkout";
import { setCheckoutProvider, setWebhookProvider } from "@/lib/payments/provider";
import { handlePaymentWebhook } from "@/lib/payments/webhook";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { CheckoutSessionInput, PaymentWebhookEvent } from "@/lib/payments/types";
import type { LicenseRow, TransactionRow } from "@/lib/db/types";

let createdUserIds: string[] = [];

afterEach(async () => {
  // transactions.license_id and licenses.creator_id/buyer_id are all ON
  // DELETE RESTRICT by design (migrations 009/010 — neither an existing
  // license nor its transaction record may be silently destroyed by
  // deleting the people behind them), so this milestone's tests must
  // clean up in FK order: transactions, then licenses, then users.
  await query(
    `DELETE FROM transactions
     WHERE license_id IN (
       SELECT id FROM licenses
       WHERE creator_id IN (SELECT id FROM creator_profiles WHERE user_id = ANY($1::uuid[]))
          OR buyer_id IN (SELECT id FROM buyer_profiles WHERE user_id = ANY($1::uuid[]))
     )`,
    [createdUserIds]
  );
  await query(
    `DELETE FROM licenses
     WHERE creator_id IN (SELECT id FROM creator_profiles WHERE user_id = ANY($1::uuid[]))
        OR buyer_id IN (SELECT id FROM buyer_profiles WHERE user_id = ANY($1::uuid[]))`,
    [createdUserIds]
  );
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
  setCheckoutProvider(null);
  setWebhookProvider(null);
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`payments-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeBuyerSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`payments-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query(
    "INSERT INTO buyer_profiles (user_id, organization_name, organization_type) VALUES ($1, 'Acme AI Co', 'AI company')",
    [user!.id]
  );
  return { userId: user!.id, email: user!.email, role: "buyer" };
}

const contentInput = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  sourcePlatform: "youtube",
  title: "How compressors work",
  category: "engineering",
  language: "en",
  ownershipAttested: true as const,
};

/** Full chain through Milestone 14 to a real pending_payment license, with a given base_price. */
async function makePendingLicense(basePrice: number | null): Promise<{ creator: Session; buyer: Session; license: LicenseRow }> {
  const creator = await makeCreatorSession();
  const item = await createContentItem(creator, contentInput);
  await query(
    `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
     VALUES ($1, 'knowledge_audit', 'summary', 50)`,
    [item.id]
  );
  await query("UPDATE content_items SET status = 'approved', rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
  await listContentOnMarketplace(creator, item.id);
  await setLicensingTerms(creator, item.id, {
    allowedUseTypes: ["RAG dataset"],
    commercialStatus: "commercial",
    basePrice: basePrice ?? undefined,
  });

  const buyer = await makeBuyerSession();
  const req = await createAccessRequest(buyer, {
    contentItemId: item.id,
    intendedUse: "RAG dataset for internal research",
    requestedScope: "internal use only",
  });
  await approveAccessRequest(creator, req.id);

  const [license] = await query<LicenseRow>("SELECT * FROM licenses WHERE access_request_id = $1", [req.id]);
  return { creator, buyer, license: license! };
}

describe("startCheckoutForLicense", () => {
  it("creates a checkout session with the amount computed from the license's terms_snapshot", async () => {
    const { buyer, license } = await makePendingLicense(499.99);
    let received: CheckoutSessionInput | null = null;
    setCheckoutProvider({
      createCheckoutSession: async (input) => {
        received = input;
        return { checkoutUrl: "https://checkout.stripe.com/test-session" };
      },
    });

    const result = await startCheckoutForLicense(buyer, license.id, {
      successUrl: "https://example.com/success",
      cancelUrl: "https://example.com/cancel",
    });

    expect(result.checkoutUrl).toBe("https://checkout.stripe.com/test-session");
    expect(received).toMatchObject({ licenseId: license.id, amountCents: 49999, productName: "How compressors work" });
  });

  it("rejects a buyer who doesn't own the license", async () => {
    const { license } = await makePendingLicense(100);
    const otherBuyer = await makeBuyerSession();
    await expect(
      startCheckoutForLicense(otherBuyer, license.id, { successUrl: "https://x", cancelUrl: "https://x" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects starting checkout for a license that isn't pending_payment", async () => {
    const { buyer, license } = await makePendingLicense(100);
    await query("UPDATE licenses SET status = 'active' WHERE id = $1", [license.id]);
    await expect(
      startCheckoutForLicense(buyer, license.id, { successUrl: "https://x", cancelUrl: "https://x" })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a license with no price set", async () => {
    const { buyer, license } = await makePendingLicense(null);
    await expect(
      startCheckoutForLicense(buyer, license.id, { successUrl: "https://x", cancelUrl: "https://x" })
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("handlePaymentWebhook", () => {
  function stubWebhookEvent(event: PaymentWebhookEvent) {
    setWebhookProvider({ constructWebhookEvent: () => event });
  }

  it("activates a pending_payment license and records a reconciling transaction", async () => {
    const { license } = await makePendingLicense(499.99);
    stubWebhookEvent({
      type: "checkout.session.completed",
      sessionId: "cs_test_abc",
      licenseId: license.id,
      amountTotalCents: 49999,
      paid: true,
    });

    const result = await handlePaymentWebhook("{}", "sig");
    expect(result.handled).toBe(true);

    const [updated] = await query<LicenseRow>("SELECT * FROM licenses WHERE id = $1", [license.id]);
    expect(updated!.status).toBe("active");
    expect(updated!.start_date).toBeTruthy();

    const [tx] = await query<TransactionRow>("SELECT * FROM transactions WHERE license_id = $1", [license.id]);
    expect(tx).toBeTruthy();
    expect(tx!.buyer_amount).toBe("499.99");
    expect(tx!.creator_amount).toBe("399.99"); // 80% of 499.99, rounded to the cent
    expect(tx!.platform_fee).toBe("100.00");
    expect(tx!.currency).toBe("USD");
    expect(tx!.payment_provider).toBe("stripe");
    expect(tx!.payment_reference).toBe("cs_test_abc");
    expect(tx!.status).toBe("succeeded");
    // Financial integrity: buyer_amount = platform_fee + creator_amount exactly (DB CHECK constraint).
    expect(Number(tx!.buyer_amount)).toBeCloseTo(Number(tx!.platform_fee) + Number(tx!.creator_amount), 2);
  });

  it("writes audit log entries for the transaction and the license activation", async () => {
    const { license } = await makePendingLicense(100);
    stubWebhookEvent({
      type: "checkout.session.completed",
      sessionId: "cs_test_audit",
      licenseId: license.id,
      amountTotalCents: 10000,
      paid: true,
    });
    await handlePaymentWebhook("{}", "sig");

    const [activateLog] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'license.activate'",
      [license.id]
    );
    expect(activateLog?.action).toBe("license.activate");

    const [txLog] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE action = 'transaction.create' AND metadata->>'license_id' = $1",
      [license.id]
    );
    expect(txLog?.action).toBe("transaction.create");
  });

  it("is idempotent: replaying the same event on an already-active license creates no second transaction", async () => {
    const { license } = await makePendingLicense(100);
    const event: PaymentWebhookEvent = {
      type: "checkout.session.completed",
      sessionId: "cs_test_dup",
      licenseId: license.id,
      amountTotalCents: 10000,
      paid: true,
    };
    stubWebhookEvent(event);
    const first = await handlePaymentWebhook("{}", "sig");
    expect(first.handled).toBe(true);

    stubWebhookEvent(event); // Stripe redelivering the same event
    const second = await handlePaymentWebhook("{}", "sig");
    expect(second.handled).toBe(false);

    const txs = await query("SELECT id FROM transactions WHERE license_id = $1", [license.id]);
    expect(txs).toHaveLength(1);
  });

  it("does nothing for an unhandled event type", async () => {
    const { license } = await makePendingLicense(100);
    stubWebhookEvent({ type: "unhandled", stripeEventType: "payment_intent.created" });

    const result = await handlePaymentWebhook("{}", "sig");
    expect(result.handled).toBe(false);

    const [row] = await query<{ status: string }>("SELECT status FROM licenses WHERE id = $1", [license.id]);
    expect(row?.status).toBe("pending_payment");
  });

  it("does nothing for an unpaid session (still handled: false, no activation)", async () => {
    const { license } = await makePendingLicense(100);
    stubWebhookEvent({
      type: "checkout.session.completed",
      sessionId: "cs_test_unpaid",
      licenseId: license.id,
      amountTotalCents: 10000,
      paid: false,
    });

    const result = await handlePaymentWebhook("{}", "sig");
    expect(result.handled).toBe(false);
    const [row] = await query<{ status: string }>("SELECT status FROM licenses WHERE id = $1", [license.id]);
    expect(row?.status).toBe("pending_payment");
  });

  it("does not throw for an unrecognized license id (never 500s a webhook Stripe would retry forever)", async () => {
    stubWebhookEvent({
      type: "checkout.session.completed",
      sessionId: "cs_test_unknown",
      licenseId: "00000000-0000-0000-0000-000000000000",
      amountTotalCents: 10000,
      paid: true,
    });
    await expect(handlePaymentWebhook("{}", "sig")).resolves.toEqual({ handled: false });
  });
});
