import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import {
  assertOwnsAccessRequestAsBuyer,
  assertOwnsContentForAccessRequest,
  assertOwnsContentItem,
  assertOwnsLicense,
  requireBuyerProfileId,
  requireCreatorProfileId,
} from "@/lib/auth/ownership";
import { NotFoundError, ForbiddenError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

interface Ids {
  users: string[];
  creatorProfiles: string[];
  buyerProfiles: string[];
  contentItems: string[];
  accessRequests: string[];
  licenses: string[];
}

function freshIds(): Ids {
  return { users: [], creatorProfiles: [], buyerProfiles: [], contentItems: [], accessRequests: [], licenses: [] };
}

let ids = freshIds();

afterEach(async () => {
  await query("DELETE FROM licenses WHERE id = ANY($1::uuid[])", [ids.licenses]);
  await query("DELETE FROM access_requests WHERE id = ANY($1::uuid[])", [ids.accessRequests]);
  await query("DELETE FROM content_items WHERE id = ANY($1::uuid[])", [ids.contentItems]);
  await query("DELETE FROM buyer_profiles WHERE id = ANY($1::uuid[])", [ids.buyerProfiles]);
  await query("DELETE FROM creator_profiles WHERE id = ANY($1::uuid[])", [ids.creatorProfiles]);
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [ids.users]);
  ids = freshIds();
});

async function makeCreator(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`ownership-test-${crypto.randomUUID()}@example.com`]
  );
  ids.users.push(user!.id);
  const [profile] = await query<{ id: string }>(
    "INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test') RETURNING id",
    [user!.id]
  );
  ids.creatorProfiles.push(profile!.id);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeBuyer(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`ownership-test-${crypto.randomUUID()}@example.com`]
  );
  ids.users.push(user!.id);
  const [profile] = await query<{ id: string }>(
    "INSERT INTO buyer_profiles (user_id, organization_name, organization_type) VALUES ($1, 'Org', 'enterprise') RETURNING id",
    [user!.id]
  );
  ids.buyerProfiles.push(profile!.id);
  return { userId: user!.id, email: user!.email, role: "buyer" };
}

async function makeContentItem(creatorProfileId: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO content_items
       (creator_id, source_url, source_platform, title, language, category,
        ownership_attested_at, ownership_attestation_text)
     VALUES ($1, 'https://example.com/video', 'youtube', 'Video', 'en', 'engineering', now(), 'test attestation')
     RETURNING id`,
    [creatorProfileId]
  );
  ids.contentItems.push(row!.id);
  return row!.id;
}

async function makeAccessRequest(contentItemId: string, buyerProfileId: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO access_requests (content_item_id, buyer_id, intended_use, requested_scope)
     VALUES ($1, $2, 'RAG dataset', 'internal') RETURNING id`,
    [contentItemId, buyerProfileId]
  );
  ids.accessRequests.push(row!.id);
  return row!.id;
}

async function makeLicense(contentItemId: string, creatorProfileId: string, buyerProfileId: string, accessRequestId: string): Promise<string> {
  const [row] = await query<{ id: string }>(
    `INSERT INTO licenses (content_item_id, creator_id, buyer_id, access_request_id, license_type, terms_snapshot)
     VALUES ($1, $2, $3, $4, 'standard', '{}'::jsonb) RETURNING id`,
    [contentItemId, creatorProfileId, buyerProfileId, accessRequestId]
  );
  ids.licenses.push(row!.id);
  return row!.id;
}

describe("requireCreatorProfileId / requireBuyerProfileId", () => {
  it("rejects a buyer session asking for a creator profile", async () => {
    const buyer = await makeBuyer();
    await expect(requireCreatorProfileId(buyer)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("rejects a creator session that hasn't created a profile yet", async () => {
    const [user] = await query<{ id: string; email: string }>(
      "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
      [`ownership-test-${crypto.randomUUID()}@example.com`]
    );
    ids.users.push(user!.id);
    await expect(
      requireCreatorProfileId({ userId: user!.id, email: user!.email, role: "creator" })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("resolves for a valid creator/buyer session with a profile", async () => {
    const creator = await makeCreator();
    await expect(requireCreatorProfileId(creator)).resolves.toEqual(ids.creatorProfiles[0]);
    const buyer = await makeBuyer();
    await expect(requireBuyerProfileId(buyer)).resolves.toEqual(ids.buyerProfiles[0]);
  });
});

describe("assertOwnsContentItem", () => {
  it("allows the owning creator", async () => {
    const creator = await makeCreator();
    const creatorProfileId = await requireCreatorProfileId(creator);
    const contentId = await makeContentItem(creatorProfileId);
    await expect(assertOwnsContentItem(creator, contentId)).resolves.toBeUndefined();
  });

  it("rejects a different creator with NotFoundError, not ForbiddenError", async () => {
    const owner = await makeCreator();
    const ownerProfileId = await requireCreatorProfileId(owner);
    const contentId = await makeContentItem(ownerProfileId);

    const otherCreator = await makeCreator();
    await expect(assertOwnsContentItem(otherCreator, contentId)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a nonexistent content item", async () => {
    const creator = await makeCreator();
    await requireCreatorProfileId(creator);
    await expect(
      assertOwnsContentItem(creator, "00000000-0000-0000-0000-000000000000")
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assertOwnsAccessRequestAsBuyer / assertOwnsContentForAccessRequest", () => {
  it("allows the requesting buyer and the content-owning creator, rejects everyone else", async () => {
    const creator = await makeCreator();
    const creatorProfileId = await requireCreatorProfileId(creator);
    const contentId = await makeContentItem(creatorProfileId);

    const buyer = await makeBuyer();
    const buyerProfileId = await requireBuyerProfileId(buyer);
    const requestId = await makeAccessRequest(contentId, buyerProfileId);

    await expect(assertOwnsAccessRequestAsBuyer(buyer, requestId)).resolves.toBeUndefined();
    await expect(assertOwnsContentForAccessRequest(creator, requestId)).resolves.toBeUndefined();

    const otherBuyer = await makeBuyer();
    await expect(assertOwnsAccessRequestAsBuyer(otherBuyer, requestId)).rejects.toBeInstanceOf(NotFoundError);

    const otherCreator = await makeCreator();
    await expect(assertOwnsContentForAccessRequest(otherCreator, requestId)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe("assertOwnsLicense", () => {
  it("allows both the creator side and the buyer side, rejects a third party", async () => {
    const creator = await makeCreator();
    const creatorProfileId = await requireCreatorProfileId(creator);
    const contentId = await makeContentItem(creatorProfileId);

    const buyer = await makeBuyer();
    const buyerProfileId = await requireBuyerProfileId(buyer);
    const requestId = await makeAccessRequest(contentId, buyerProfileId);
    const licenseId = await makeLicense(contentId, creatorProfileId, buyerProfileId, requestId);

    await expect(assertOwnsLicense(creator, licenseId)).resolves.toBeUndefined();
    await expect(assertOwnsLicense(buyer, licenseId)).resolves.toBeUndefined();

    const otherBuyer = await makeBuyer();
    await expect(assertOwnsLicense(otherBuyer, licenseId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
