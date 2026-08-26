import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import {
  createAccessRequest,
  listAccessRequestsForBuyer,
  getOwnAccessRequestForContent,
} from "@/lib/buyer/requests";
import { listAccessRequestsForCreator, approveAccessRequest, rejectAccessRequest } from "@/lib/creator/requests";
import { NotFoundError, ValidationError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`access-request-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeBuyerSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`access-request-test-${crypto.randomUUID()}@example.com`]
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

const requestInput = {
  intendedUse: "RAG dataset for internal research",
  requestedScope: "internal use only",
};

async function makeListedItem(creator: Session) {
  const item = await createContentItem(creator, contentInput);
  await query(
    `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
     VALUES ($1, 'knowledge_audit', 'summary', 50)`,
    [item.id]
  );
  await listContentOnMarketplace(creator, item.id);
  return item;
}

describe("createAccessRequest", () => {
  it("rejects a request against a non-listed content item", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput); // SUBMITTED, not listed
    const buyer = await makeBuyerSession();

    await expect(
      createAccessRequest(buyer, { ...requestInput, contentItemId: item.id })
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("creates a pending request against a listed item", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();

    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });
    expect(req.status).toBe("pending");
    expect(req.content_item_id).toBe(item.id);
  });

  it("returns the existing request instead of creating a duplicate while one is pending", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();

    const first = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });
    const second = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });
    expect(second.id).toBe(first.id);

    const rows = await query("SELECT id FROM access_requests WHERE content_item_id = $1", [item.id]);
    expect(rows).toHaveLength(1);
  });

  it("writes an audit log entry", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'access_request.create'",
      [req.id]
    );
    expect(log?.action).toBe("access_request.create");
  });
});

describe("listAccessRequestsForBuyer / listAccessRequestsForCreator", () => {
  it("scopes correctly: buyer sees only their own, creator sees only requests for their own content", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const otherBuyer = await makeBuyerSession();
    await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });

    const buyerView = await listAccessRequestsForBuyer(buyer);
    expect(buyerView).toHaveLength(1);
    expect(buyerView[0]!.contentItemTitle).toBe("How compressors work");

    const otherBuyerView = await listAccessRequestsForBuyer(otherBuyer);
    expect(otherBuyerView).toHaveLength(0);

    const creatorView = await listAccessRequestsForCreator(creator);
    expect(creatorView).toHaveLength(1);
    expect(creatorView[0]!.buyerOrganizationName).toBe("Acme AI Co");
  });
});

describe("getOwnAccessRequestForContent", () => {
  it("returns null when the buyer has never requested this item", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    await expect(getOwnAccessRequestForContent(buyer, item.id)).resolves.toBeNull();
  });

  it("returns null for a creator session (not a buyer concept)", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    await expect(getOwnAccessRequestForContent(creator, item.id)).resolves.toBeNull();
  });

  it("returns the buyer's own request once made", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });

    const found = await getOwnAccessRequestForContent(buyer, item.id);
    expect(found?.id).toBe(req.id);
  });
});

describe("approveAccessRequest / rejectAccessRequest", () => {
  it("approves a pending request, owned by the content's creator", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });

    const approved = await approveAccessRequest(creator, req.id);
    expect(approved.status).toBe("approved");
  });

  it("rejects a pending request", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });

    const rejected = await rejectAccessRequest(creator, req.id);
    expect(rejected.status).toBe("rejected");
  });

  it("rejects re-resolving an already-resolved request", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });
    await approveAccessRequest(creator, req.id);

    await expect(approveAccessRequest(creator, req.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(rejectAccessRequest(creator, req.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a different creator from approving/rejecting someone else's content's request", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });

    const otherCreator = await makeCreatorSession();
    await expect(approveAccessRequest(otherCreator, req.id)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rejectAccessRequest(otherCreator, req.id)).rejects.toBeInstanceOf(NotFoundError);

    // Confirm it's genuinely untouched, not just that an error was thrown.
    const stillPending = await getOwnAccessRequestForContent(buyer, item.id);
    expect(stillPending?.status).toBe("pending");
  });

  it("writes audit log entries for approve/reject", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });
    await approveAccessRequest(creator, req.id);

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'access_request.approve'",
      [req.id]
    );
    expect(log?.action).toBe("access_request.approve");
  });

  it("never changes content_items.rights_status as a side effect of approval", async () => {
    const creator = await makeCreatorSession();
    const item = await makeListedItem(creator);
    const buyer = await makeBuyerSession();
    const req = await createAccessRequest(buyer, { ...requestInput, contentItemId: item.id });
    await approveAccessRequest(creator, req.id);

    const [row] = await query<{ rights_status: string }>("SELECT rights_status FROM content_items WHERE id = $1", [
      item.id,
    ]);
    expect(row?.rights_status).toBe("LISTED");
  });
});
