import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import { setLicensingTerms } from "@/lib/creator/licensing-terms";
import { createAccessRequest } from "@/lib/buyer/requests";
import { approveAccessRequest } from "@/lib/creator/requests";
import { setWebhookProvider } from "@/lib/payments/provider";
import { handlePaymentWebhook } from "@/lib/payments/webhook";
import { getPlatformAnalytics } from "@/lib/admin/analytics";
import { ForbiddenError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";
import type { LicenseRow } from "@/lib/db/types";
import type { PaymentWebhookEvent } from "@/lib/payments/types";

let createdUserIds: string[] = [];

afterEach(async () => {
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

async function makeAdminSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'admin') RETURNING id, email",
    [`admin-analytics-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return { userId: user!.id, email: user!.email, role: "admin" };
}

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`admin-analytics-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeBuyerSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`admin-analytics-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query(
    "INSERT INTO buyer_profiles (user_id, organization_name, organization_type) VALUES ($1, 'Acme AI Co', 'AI company')",
    [user!.id]
  );
  return { userId: user!.id, email: user!.email, role: "buyer" };
}

function countOf(rows: { status: string; count: number }[], status: string): number {
  return rows.find((r) => r.status === status)?.count ?? 0;
}

describe("getPlatformAnalytics", () => {
  it("rejects a non-admin caller", async () => {
    const creator = await makeCreatorSession();
    await expect(getPlatformAnalytics(creator)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("moves a creator through the full supply funnel and a buyer through the full demand funnel, reflected as deltas", async () => {
    const admin = await makeAdminSession();
    const before = await getPlatformAnalytics(admin);

    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, {
      sourceUrl: "https://youtube.com/watch?v=" + crypto.randomUUID(),
      sourcePlatform: "youtube",
      title: "Analytics funnel test",
      category: "engineering",
      language: "en",
      ownershipAttested: true,
    });
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET status = 'approved', rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [
      item.id,
    ]);
    await listContentOnMarketplace(creator, item.id);
    await setLicensingTerms(creator, item.id, { allowedUseTypes: ["RAG dataset"], basePrice: 100 });

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
      sessionId: "cs_analytics_" + crypto.randomUUID(),
      licenseId: license!.id,
      amountTotalCents: 10000,
      paid: true,
    };
    setWebhookProvider({ constructWebhookEvent: () => event });
    await handlePaymentWebhook("{}", "sig");

    const after = await getPlatformAnalytics(admin);

    expect(after.supplyFunnel.signedUp - before.supplyFunnel.signedUp).toBe(1);
    expect(after.supplyFunnel.hasProfile - before.supplyFunnel.hasProfile).toBe(1);
    expect(after.supplyFunnel.hasSubmittedContent - before.supplyFunnel.hasSubmittedContent).toBe(1);
    expect(after.supplyFunnel.hasEverListed - before.supplyFunnel.hasEverListed).toBe(1);

    expect(after.demandFunnel.signedUp - before.demandFunnel.signedUp).toBe(1);
    expect(after.demandFunnel.hasProfile - before.demandFunnel.hasProfile).toBe(1);
    expect(after.demandFunnel.hasMadeRequest - before.demandFunnel.hasMadeRequest).toBe(1);
    expect(after.demandFunnel.hasActiveLicense - before.demandFunnel.hasActiveLicense).toBe(1);

    expect(Number(after.commerceTotals.gmv) - Number(before.commerceTotals.gmv)).toBeCloseTo(100, 2);
    expect(Number(after.commerceTotals.platformRevenue) - Number(before.commerceTotals.platformRevenue)).toBeCloseTo(
      20,
      2
    );
    expect(
      Number(after.commerceTotals.creatorPayoutsOwed) - Number(before.commerceTotals.creatorPayoutsOwed)
    ).toBeCloseTo(80, 2);
    expect(after.commerceTotals.succeededTransactionCount - before.commerceTotals.succeededTransactionCount).toBe(1);

    expect(countOf(after.licensesByStatus, "active") - countOf(before.licensesByStatus, "active")).toBe(1);
    expect(countOf(after.accessRequestsByStatus, "approved") - countOf(before.accessRequestsByStatus, "approved")).toBe(
      1
    );
    expect(
      countOf(after.transactionsByStatus, "succeeded") - countOf(before.transactionsByStatus, "succeeded")
    ).toBe(1);
    expect(countOf(after.contentByRightsStatus, "LISTED") - countOf(before.contentByRightsStatus, "LISTED")).toBe(1);
    expect(
      countOf(after.contentByModerationStatus, "approved") - countOf(before.contentByModerationStatus, "approved")
    ).toBe(1);
  });

  it("hasEverListed stays counted after the content is later unlisted (cumulative, not current-state)", async () => {
    const admin = await makeAdminSession();
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, {
      sourceUrl: "https://youtube.com/watch?v=" + crypto.randomUUID(),
      sourcePlatform: "youtube",
      title: "Unlist test",
      category: "engineering",
      language: "en",
      ownershipAttested: true,
    });
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET status = 'approved', rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [
      item.id,
    ]);
    await listContentOnMarketplace(creator, item.id);

    const before = await getPlatformAnalytics(admin);
    const { unlistContentFromMarketplace } = await import("@/lib/creator/listing");
    await unlistContentFromMarketplace(creator, item.id);
    const after = await getPlatformAnalytics(admin);

    expect(after.supplyFunnel.hasEverListed).toBe(before.supplyFunnel.hasEverListed);
  });

  it("returns 30 rows of daily signups, most recent day last, and today's signup is counted", async () => {
    const admin = await makeAdminSession();
    await makeCreatorSession();

    const analytics = await getPlatformAnalytics(admin);
    expect(analytics.dailySignups).toHaveLength(30);
    const today = new Date().toISOString().slice(0, 10);
    expect(analytics.dailySignups[29]!.date).toBe(today);
    expect(analytics.dailySignups[29]!.creators).toBeGreaterThanOrEqual(1);
  });
});
