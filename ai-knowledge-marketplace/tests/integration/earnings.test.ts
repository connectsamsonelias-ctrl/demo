import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import { setLicensingTerms } from "@/lib/creator/licensing-terms";
import { createAccessRequest } from "@/lib/buyer/requests";
import { approveAccessRequest } from "@/lib/creator/requests";
import { setWebhookProvider } from "@/lib/payments/provider";
import { handlePaymentWebhook } from "@/lib/payments/webhook";
import { getEarningsSummaryForCreator, listEarningsForCreator } from "@/lib/creator/earnings";
import type { Session } from "@/lib/auth/session";
import type { LicenseRow } from "@/lib/db/types";
import type { PaymentWebhookEvent } from "@/lib/payments/types";

let createdUserIds: string[] = [];

afterEach(async () => {
  // Same FK-order reasoning as tests/integration/payments.test.ts:
  // transactions.license_id and licenses.creator_id/buyer_id are ON
  // DELETE RESTRICT.
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
  setWebhookProvider(null);
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`earnings-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeBuyerSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`earnings-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query(
    "INSERT INTO buyer_profiles (user_id, organization_name, organization_type) VALUES ($1, 'Acme AI Co', 'AI company')",
    [user!.id]
  );
  return { userId: user!.id, email: user!.email, role: "buyer" };
}

/** Full chain to an active, paid license with a given base_price, mirroring tests/integration/payments.test.ts. */
async function makeActiveLicense(
  creator: Session,
  basePrice: number,
  titleSuffix: string
): Promise<LicenseRow> {
  const item = await createContentItem(creator, {
    sourceUrl: "https://youtube.com/watch?v=" + crypto.randomUUID(),
    sourcePlatform: "youtube",
    title: "How compressors work " + titleSuffix,
    category: "engineering",
    language: "en",
    ownershipAttested: true,
  });
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
    basePrice,
  });

  const buyer = await makeBuyerSession();
  const req = await createAccessRequest(buyer, {
    contentItemId: item.id,
    intendedUse: "RAG dataset for internal research",
    requestedScope: "internal use only",
  });
  await approveAccessRequest(creator, req.id);
  const [license] = await query<LicenseRow>("SELECT * FROM licenses WHERE access_request_id = $1", [req.id]);

  const event: PaymentWebhookEvent = {
    type: "checkout.session.completed",
    sessionId: "cs_earnings_" + crypto.randomUUID(),
    licenseId: license!.id,
    amountTotalCents: Math.round(basePrice * 100),
    paid: true,
  };
  setWebhookProvider({ constructWebhookEvent: () => event });
  await handlePaymentWebhook("{}", "sig");

  return license!;
}

describe("getEarningsSummaryForCreator / listEarningsForCreator", () => {
  it("returns zero for a creator with no transactions", async () => {
    const creator = await makeCreatorSession();
    const summary = await getEarningsSummaryForCreator(creator);
    expect(summary).toEqual({ totalEarned: "0.00", currency: "USD", transactionCount: 0 });
    await expect(listEarningsForCreator(creator)).resolves.toEqual([]);
  });

  it("sums the creator's 80% share across multiple succeeded transactions", async () => {
    const creator = await makeCreatorSession();
    await makeActiveLicense(creator, 100, "A");
    await makeActiveLicense(creator, 250, "B");

    const summary = await getEarningsSummaryForCreator(creator);
    // 80% of 100 = 80.00, 80% of 250 = 200.00 -> 280.00 total.
    expect(summary.totalEarned).toBe("280.00");
    expect(summary.transactionCount).toBe(2);
  });

  it("lists individual entries with content title, buyer org, and the creator's own share", async () => {
    const creator = await makeCreatorSession();
    await makeActiveLicense(creator, 100, "A");

    const entries = await listEarningsForCreator(creator);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      contentItemTitle: "How compressors work A",
      buyerOrganizationName: "Acme AI Co",
      creator_amount: "80.00",
      status: "succeeded",
    });
  });

  it("scopes correctly: a different creator sees none of this creator's earnings", async () => {
    const creator = await makeCreatorSession();
    await makeActiveLicense(creator, 100, "A");

    const otherCreator = await makeCreatorSession();
    const otherSummary = await getEarningsSummaryForCreator(otherCreator);
    expect(otherSummary.totalEarned).toBe("0.00");
    await expect(listEarningsForCreator(otherCreator)).resolves.toEqual([]);
  });

  it("excludes non-succeeded transactions from the total but still lists them", async () => {
    const creator = await makeCreatorSession();
    const license = await makeActiveLicense(creator, 100, "A");
    // Simulate a second, failed transaction against the same license (e.g. a later re-attempt).
    await query(
      `INSERT INTO transactions (license_id, buyer_amount, platform_fee, creator_amount, currency, payment_provider, payment_reference, status)
       VALUES ($1, 50.00, 10.00, 40.00, 'USD', 'stripe', $2, 'failed')`,
      [license.id, "cs_failed_" + crypto.randomUUID()]
    );

    const summary = await getEarningsSummaryForCreator(creator);
    expect(summary.totalEarned).toBe("80.00"); // only the succeeded one counts
    expect(summary.transactionCount).toBe(1);

    const entries = await listEarningsForCreator(creator);
    expect(entries).toHaveLength(2); // the ledger itself shows both
    expect(entries.map((e) => e.status).sort()).toEqual(["failed", "succeeded"]);
  });
});
