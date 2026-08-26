import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace, unlistContentFromMarketplace, hasCompletedAudit } from "@/lib/creator/listing";
import { listMarketplaceItems, getMarketplaceItem } from "@/lib/marketplace";
import { ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`marketplace-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

const contentInput = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  sourcePlatform: "youtube",
  title: "How compressors work",
  category: "engineering",
  language: "en",
  ownershipAttested: true as const,
};

async function simulateCompletedAudit(contentItemId: string) {
  await query(
    `INSERT INTO knowledge_assets
       (content_item_id, asset_type, summary, topics, skills, entities, structured_content, provenance, quality_score)
     VALUES ($1, 'knowledge_audit', 'A summary', '["topic a"]'::jsonb, '["skill a"]'::jsonb,
             '["entity a"]'::jsonb, '{"potentialUseCases": ["RAG"]}'::jsonb,
             '{"model": "stub", "input_basis": "metadata_only"}'::jsonb, 55)`,
    [contentItemId]
  );
}

describe("listContentOnMarketplace", () => {
  it("rejects listing without a completed audit", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await expect(listContentOnMarketplace(session, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("lists content that has a completed audit, transitioning SUBMITTED -> LISTED", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await simulateCompletedAudit(item.id);

    const updated = await listContentOnMarketplace(session, item.id);
    expect(updated.rights_status).toBe("LISTED");
  });

  it("rejects listing content that is already listed", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await simulateCompletedAudit(item.id);
    await listContentOnMarketplace(session, item.id);

    await expect(listContentOnMarketplace(session, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a different creator from listing someone else's content", async () => {
    const owner = await makeCreatorSession();
    const item = await createContentItem(owner, contentInput);
    await simulateCompletedAudit(item.id);
    const other = await makeCreatorSession();

    await expect(listContentOnMarketplace(other, item.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("writes an audit log entry", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await simulateCompletedAudit(item.id);
    await listContentOnMarketplace(session, item.id);

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'content.listed'",
      [item.id]
    );
    expect(log?.action).toBe("content.listed");
  });
});

describe("unlistContentFromMarketplace", () => {
  it("rejects unlisting content that isn't listed", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await expect(unlistContentFromMarketplace(session, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("unlists listed content, transitioning LISTED -> WITHDRAWN", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await simulateCompletedAudit(item.id);
    await listContentOnMarketplace(session, item.id);

    const updated = await unlistContentFromMarketplace(session, item.id);
    expect(updated.rights_status).toBe("WITHDRAWN");
  });
});

describe("hasCompletedAudit", () => {
  it("reflects whether a knowledge_assets row exists", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await expect(hasCompletedAudit(item.id)).resolves.toBe(false);
    await simulateCompletedAudit(item.id);
    await expect(hasCompletedAudit(item.id)).resolves.toBe(true);
  });
});

describe("listMarketplaceItems / getMarketplaceItem", () => {
  it("only returns LISTED items, not SUBMITTED ones", async () => {
    const session = await makeCreatorSession();
    const listedItem = await createContentItem(session, contentInput);
    await simulateCompletedAudit(listedItem.id);
    await listContentOnMarketplace(session, listedItem.id);

    const unlistedItem = await createContentItem(session, { ...contentInput, title: "Not listed" });

    const items = await listMarketplaceItems();
    const ids = items.map((i) => i.id);
    expect(ids).toContain(listedItem.id);
    expect(ids).not.toContain(unlistedItem.id);
  });

  it("returns null for a nonexistent listing", async () => {
    await expect(getMarketplaceItem("00000000-0000-0000-0000-000000000000")).resolves.toBeNull();
  });

  it("returns null for an existing but non-listed item — same as nonexistent, no enumeration signal", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await expect(getMarketplaceItem(item.id)).resolves.toBeNull();
  });

  it("returns full detail for a listed item, including audit-derived fields", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await simulateCompletedAudit(item.id);
    await listContentOnMarketplace(session, item.id);

    const detail = await getMarketplaceItem(item.id);
    expect(detail).toMatchObject({
      title: "How compressors work",
      creatorDisplayName: "Test Creator",
      rightsStatus: "LISTED",
      topics: ["topic a"],
      skills: ["skill a"],
      entities: ["entity a"],
      potentialUseCases: ["RAG"],
      provenanceBasis: "metadata_only",
    });
  });

  it("never exposes internal-only fields (ownership attestation, creator user_id)", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await simulateCompletedAudit(item.id);
    await listContentOnMarketplace(session, item.id);

    const detail = await getMarketplaceItem(item.id);
    const keys = Object.keys(detail!);
    expect(keys).not.toContain("ownership_attestation_text");
    expect(keys).not.toContain("ownershipAttestationText");
    expect(keys).not.toContain("userId");
    expect(keys).not.toContain("user_id");

    const listItems = await listMarketplaceItems();
    const listKeys = Object.keys(listItems[0]!);
    expect(listKeys).not.toContain("ownership_attestation_text");
  });
});
