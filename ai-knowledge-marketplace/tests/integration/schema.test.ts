import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";

/**
 * Exercises the schema-level guarantees from Milestone 2: FK integrity
 * (including the RESTRICT-not-CASCADE backstop for active licenses),
 * the financial CHECK constraints, and the updated_at trigger. Requires
 * a real Postgres with migrations applied — run `npm run migrate` first,
 * then `npm run test:integration`.
 */

interface Ids {
  users: string[];
  creatorProfiles: string[];
  buyerProfiles: string[];
  contentItems: string[];
  licensingTerms: string[];
  accessRequests: string[];
  licenses: string[];
  transactions: string[];
}

function freshIds(): Ids {
  return {
    users: [],
    creatorProfiles: [],
    buyerProfiles: [],
    contentItems: [],
    licensingTerms: [],
    accessRequests: [],
    licenses: [],
    transactions: [],
  };
}

let ids = freshIds();

afterEach(async () => {
  // Deleted in dependency order — children before parents — since several
  // FKs are intentionally ON DELETE RESTRICT, not CASCADE.
  await query("DELETE FROM transactions WHERE id = ANY($1::uuid[])", [ids.transactions]);
  await query("DELETE FROM licenses WHERE id = ANY($1::uuid[])", [ids.licenses]);
  await query("DELETE FROM access_requests WHERE id = ANY($1::uuid[])", [ids.accessRequests]);
  await query("DELETE FROM licensing_terms WHERE id = ANY($1::uuid[])", [ids.licensingTerms]);
  await query("DELETE FROM content_items WHERE id = ANY($1::uuid[])", [ids.contentItems]);
  await query("DELETE FROM buyer_profiles WHERE id = ANY($1::uuid[])", [ids.buyerProfiles]);
  await query("DELETE FROM creator_profiles WHERE id = ANY($1::uuid[])", [ids.creatorProfiles]);
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids.users]);
  ids = freshIds();
});

async function makeUser(role: "creator" | "buyer" | "admin") {
  const [row] = await query<{ id: string }>(
    "INSERT INTO users (email, role) VALUES ($1, $2) RETURNING id",
    [`integration-test-${crypto.randomUUID()}@example.com`, role]
  );
  ids.users.push(row!.id);
  return row!.id;
}

async function makeCreatorProfile() {
  const userId = await makeUser("creator");
  const [row] = await query<{ id: string }>(
    "INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, $2) RETURNING id",
    [userId, "Test Creator"]
  );
  ids.creatorProfiles.push(row!.id);
  return row!.id;
}

async function makeBuyerProfile() {
  const userId = await makeUser("buyer");
  const [row] = await query<{ id: string }>(
    "INSERT INTO buyer_profiles (user_id, organization_name, organization_type) VALUES ($1, $2, $3) RETURNING id",
    [userId, "Test Org", "enterprise"]
  );
  ids.buyerProfiles.push(row!.id);
  return row!.id;
}

async function makeContentItem(creatorId: string) {
  const [row] = await query<{ id: string }>(
    `INSERT INTO content_items (creator_id, source_url, source_platform, title, language, category)
     VALUES ($1, 'https://example.com/video', 'youtube', 'Test video', 'en', 'engineering')
     RETURNING id`,
    [creatorId]
  );
  ids.contentItems.push(row!.id);
  return row!.id;
}

describe("creator_profiles / buyer_profiles", () => {
  it("cascades on user deletion", async () => {
    const userId = await makeUser("creator");
    const [profile] = await query<{ id: string }>(
      "INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'X') RETURNING id",
      [userId]
    );
    ids.creatorProfiles.push(profile!.id);

    await query("DELETE FROM users WHERE id = $1", [userId]);
    ids.users = ids.users.filter((id) => id !== userId);

    const rows = await query("SELECT id FROM creator_profiles WHERE id = $1", [profile!.id]);
    expect(rows).toHaveLength(0);
    ids.creatorProfiles = ids.creatorProfiles.filter((id) => id !== profile!.id);
  });
});

describe("licensing_terms.shares_sum_to_100", () => {
  it("rejects a split that does not sum to 100", async () => {
    const contentId = await makeContentItem(await makeCreatorProfile());
    await expect(
      query(
        `INSERT INTO licensing_terms (content_item_id, creator_share_percent, platform_share_percent)
         VALUES ($1, 70, 40)`,
        [contentId]
      )
    ).rejects.toThrow(/shares_sum_to_100/);
  });

  it("accepts a split that sums to 100", async () => {
    const contentId = await makeContentItem(await makeCreatorProfile());
    const [row] = await query<{ id: string }>(
      `INSERT INTO licensing_terms (content_item_id, creator_share_percent, platform_share_percent)
       VALUES ($1, 80, 20) RETURNING id`,
      [contentId]
    );
    ids.licensingTerms.push(row!.id);
  });
});

describe("transactions.amounts_reconcile", () => {
  async function makeLicense() {
    const creatorId = await makeCreatorProfile();
    const buyerId = await makeBuyerProfile();
    const contentId = await makeContentItem(creatorId);
    const [accessRequest] = await query<{ id: string }>(
      `INSERT INTO access_requests (content_item_id, buyer_id, intended_use, requested_scope)
       VALUES ($1, $2, 'RAG dataset', 'internal research') RETURNING id`,
      [contentId, buyerId]
    );
    ids.accessRequests.push(accessRequest!.id);
    const [license] = await query<{ id: string }>(
      `INSERT INTO licenses (content_item_id, creator_id, buyer_id, access_request_id, license_type, terms_snapshot)
       VALUES ($1, $2, $3, $4, 'standard', '{}'::jsonb) RETURNING id`,
      [contentId, creatorId, buyerId, accessRequest!.id]
    );
    ids.licenses.push(license!.id);
    return license!.id;
  }

  it("rejects amounts that don't reconcile", async () => {
    const licenseId = await makeLicense();
    await expect(
      query(
        `INSERT INTO transactions (license_id, buyer_amount, platform_fee, creator_amount, currency, payment_provider)
         VALUES ($1, 100, 20, 70, 'USD', 'stripe')`,
        [licenseId]
      )
    ).rejects.toThrow(/amounts_reconcile/);
  });

  it("accepts amounts that reconcile and enforces unique payment_reference", async () => {
    const licenseId = await makeLicense();
    const [tx] = await query<{ id: string }>(
      `INSERT INTO transactions (license_id, buyer_amount, platform_fee, creator_amount, currency, payment_provider, payment_reference)
       VALUES ($1, 100, 20, 80, 'USD', 'stripe', 'ch_test_123') RETURNING id`,
      [licenseId]
    );
    ids.transactions.push(tx!.id);

    await expect(
      query(
        `INSERT INTO transactions (license_id, buyer_amount, platform_fee, creator_amount, currency, payment_provider, payment_reference)
         VALUES ($1, 100, 20, 80, 'USD', 'stripe', 'ch_test_123')`,
        [licenseId]
      )
    ).rejects.toThrow(/idx_transactions_payment_reference/);
  });
});

describe("licenses FK is RESTRICT, not CASCADE", () => {
  it("prevents deleting a creator_profile that has a license", async () => {
    const creatorId = await makeCreatorProfile();
    const buyerId = await makeBuyerProfile();
    const contentId = await makeContentItem(creatorId);
    const [accessRequest] = await query<{ id: string }>(
      `INSERT INTO access_requests (content_item_id, buyer_id, intended_use, requested_scope)
       VALUES ($1, $2, 'RAG dataset', 'internal research') RETURNING id`,
      [contentId, buyerId]
    );
    ids.accessRequests.push(accessRequest!.id);
    const [license] = await query<{ id: string }>(
      `INSERT INTO licenses (content_item_id, creator_id, buyer_id, access_request_id, license_type, terms_snapshot)
       VALUES ($1, $2, $3, $4, 'standard', '{}'::jsonb) RETURNING id`,
      [contentId, creatorId, buyerId, accessRequest!.id]
    );
    ids.licenses.push(license!.id);

    // This is the schema-level proof behind the spec's rule: withdrawal
    // (or any deletion path) must never be able to silently destroy an
    // active contractual license.
    await expect(query("DELETE FROM creator_profiles WHERE id = $1", [creatorId])).rejects.toThrow(
      /violates foreign key constraint/
    );
  });
});

describe("set_updated_at trigger", () => {
  it("bumps updated_at on UPDATE without application code setting it", async () => {
    const contentId = await makeContentItem(await makeCreatorProfile());
    const [before] = await query<{ updated_at: string }>(
      "SELECT updated_at FROM content_items WHERE id = $1",
      [contentId]
    );
    await new Promise((resolve) => setTimeout(resolve, 10));
    await query("UPDATE content_items SET title = 'Updated title' WHERE id = $1", [contentId]);
    const [after] = await query<{ updated_at: string }>(
      "SELECT updated_at FROM content_items WHERE id = $1",
      [contentId]
    );
    expect(new Date(after!.updated_at).getTime()).toBeGreaterThan(new Date(before!.updated_at).getTime());
  });
});
