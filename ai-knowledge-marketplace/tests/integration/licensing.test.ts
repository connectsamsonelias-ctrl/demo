import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import { setLicensingTerms, getLicensingTermsForCreator } from "@/lib/creator/licensing-terms";
import { DEFAULT_CREATOR_SHARE_PERCENT, DEFAULT_PLATFORM_SHARE_PERCENT } from "@/lib/licensing/commission";
import { createAccessRequest } from "@/lib/buyer/requests";
import { approveAccessRequest } from "@/lib/creator/requests";
import { listLicensesForCreator } from "@/lib/creator/licenses";
import { listLicensesForBuyer } from "@/lib/buyer/licenses";
import { NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  // licenses.creator_id/buyer_id are ON DELETE RESTRICT by design (migration
  // 009), so a license created during a test must be cleaned up explicitly
  // before the user delete below can succeed.
  await query(
    `DELETE FROM licenses
     WHERE creator_id IN (SELECT id FROM creator_profiles WHERE user_id = ANY($1::uuid[]))
        OR buyer_id IN (SELECT id FROM buyer_profiles WHERE user_id = ANY($1::uuid[]))`,
    [createdUserIds]
  );
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`licensing-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeBuyerSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`licensing-test-${crypto.randomUUID()}@example.com`]
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

describe("setLicensingTerms / getLicensingTermsForCreator", () => {
  it("creates licensing terms with the default commission split, never client-settable", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);

    const terms = await setLicensingTerms(creator, item.id, {
      allowedUseTypes: ["RAG dataset"],
      commercialStatus: "commercial",
      basePrice: 100,
    });

    expect(terms.creator_share_percent).toBe(`${DEFAULT_CREATOR_SHARE_PERCENT}.00`);
    expect(terms.platform_share_percent).toBe(`${DEFAULT_PLATFORM_SHARE_PERCENT}.00`);
    expect(terms.commercial_status).toBe("commercial");
    expect(terms.allowed_use_types).toEqual(["RAG dataset"]);
  });

  it("upserts on a second call instead of creating a duplicate row", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);

    await setLicensingTerms(creator, item.id, { commercialStatus: "non_commercial" });
    const updated = await setLicensingTerms(creator, item.id, { commercialStatus: "commercial" });

    expect(updated.commercial_status).toBe("commercial");
    const rows = await query("SELECT id FROM licensing_terms WHERE content_item_id = $1", [item.id]);
    expect(rows).toHaveLength(1);
  });

  it("returns null before any terms are set", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    await expect(getLicensingTermsForCreator(creator, item.id)).resolves.toBeNull();
  });

  it("rejects a different creator from setting or reading someone else's content's terms", async () => {
    const owner = await makeCreatorSession();
    const item = await createContentItem(owner, contentInput);
    const other = await makeCreatorSession();

    await expect(setLicensingTerms(other, item.id, {})).rejects.toBeInstanceOf(NotFoundError);
    await expect(getLicensingTermsForCreator(other, item.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes an audit log entry distinguishing create from update", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    const created = await setLicensingTerms(creator, item.id, {});
    await setLicensingTerms(creator, item.id, { commercialStatus: "commercial" });

    const logs = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at ASC",
      [created.id]
    );
    expect(logs.map((l) => l.action)).toEqual(["licensing_terms.create", "licensing_terms.update"]);
  });
});

describe("listLicensesForCreator / listLicensesForBuyer", () => {
  async function makeApprovedLicense(): Promise<{ creator: Session; buyer: Session; contentItemId: string }> {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET status = 'approved', rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
    await listContentOnMarketplace(creator, item.id);
    await setLicensingTerms(creator, item.id, { allowedUseTypes: ["RAG dataset"] });

    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, {
      contentItemId: item.id,
      intendedUse: "RAG dataset for internal research",
      requestedScope: "internal use only",
    });
    await approveAccessRequest(creator, req.id);

    return { creator, buyer, contentItemId: item.id };
  }

  it("scopes correctly: creator sees their own licenses, buyer sees their own", async () => {
    const { creator, buyer, contentItemId } = await makeApprovedLicense();
    const otherCreator = await makeCreatorSession();
    const otherBuyer = await makeBuyerSession();

    const creatorLicenses = await listLicensesForCreator(creator);
    expect(creatorLicenses).toHaveLength(1);
    expect(creatorLicenses[0]!.contentItemTitle).toBe("How compressors work");
    expect(creatorLicenses[0]!.buyerOrganizationName).toBe("Acme AI Co");
    expect(creatorLicenses[0]!.content_item_id).toBe(contentItemId);

    const buyerLicenses = await listLicensesForBuyer(buyer);
    expect(buyerLicenses).toHaveLength(1);
    expect(buyerLicenses[0]!.contentItemTitle).toBe("How compressors work");

    await expect(listLicensesForCreator(otherCreator)).resolves.toHaveLength(0);
    await expect(listLicensesForBuyer(otherBuyer)).resolves.toHaveLength(0);
  });
});
