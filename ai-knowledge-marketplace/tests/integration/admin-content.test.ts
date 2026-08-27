import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import {
  listContentForModeration,
  approveContent,
  rejectContent,
  suspendContent,
  reinstateContent,
} from "@/lib/admin/content";
import { ForbiddenError, ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`admin-content-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeAdminSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'admin') RETURNING id, email",
    [`admin-content-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return { userId: user!.id, email: user!.email, role: "admin" };
}

const contentInput = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  sourcePlatform: "youtube",
  title: "How compressors work",
  category: "engineering",
  language: "en",
  ownershipAttested: true as const,
};

describe("listContentForModeration", () => {
  it("defaults to pending_review and rejects a non-admin caller", async () => {
    const creator = await makeCreatorSession();
    await createContentItem(creator, contentInput);
    const admin = await makeAdminSession();

    const queue = await listContentForModeration(admin);
    expect(queue.length).toBeGreaterThanOrEqual(1);
    expect(queue.every((i) => i.status === "pending_review")).toBe(true);
    expect(queue.some((i) => i.creatorDisplayName === "Test Creator")).toBe(true);

    await expect(listContentForModeration(creator)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("approveContent / rejectContent", () => {
  it("approves a pending_review item", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    const admin = await makeAdminSession();

    const approved = await approveContent(admin, item.id);
    expect(approved.status).toBe("approved");
  });

  it("rejects a pending_review item, optionally with a reason recorded in the audit log", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    const admin = await makeAdminSession();

    const rejected = await rejectContent(admin, item.id, "Low quality submission");
    expect(rejected.status).toBe("rejected");

    const [log] = await query<{ metadata: { reason: string } }>(
      "SELECT metadata FROM audit_logs WHERE entity_id = $1 AND action = 'content.moderate_reject'",
      [item.id]
    );
    expect(log?.metadata?.reason).toBe("Low quality submission");
  });

  it("rejects approving/rejecting an item that isn't pending_review", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    const admin = await makeAdminSession();
    await approveContent(admin, item.id);

    await expect(approveContent(admin, item.id)).rejects.toBeInstanceOf(ValidationError);
    await expect(rejectContent(admin, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("a non-admin cannot approve or reject", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);

    await expect(approveContent(creator, item.id)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rejectContent(creator, item.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("404s for a nonexistent content item", async () => {
    const admin = await makeAdminSession();
    await expect(approveContent(admin, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});

describe("listContentOnMarketplace gate (Milestone 17)", () => {
  it("rejects listing content that hasn't been approved yet, even if rights_status is eligible", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
    // Deliberately NOT approved.

    await expect(listContentOnMarketplace(creator, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows listing once an admin has approved it", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
    const admin = await makeAdminSession();
    await approveContent(admin, item.id);

    const listed = await listContentOnMarketplace(creator, item.id);
    expect(listed.rights_status).toBe("LISTED");
    expect(listed.status).toBe("approved");
  });
});

describe("suspendContent / reinstateContent", () => {
  async function makeListedItem(creator: Session, admin: Session) {
    const item = await createContentItem(creator, contentInput);
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
    await approveContent(admin, item.id);
    return listContentOnMarketplace(creator, item.id);
  }

  it("suspending a LISTED item also drives rights_status LISTED -> SUSPENDED, and it disappears from the marketplace", async () => {
    const creator = await makeCreatorSession();
    const admin = await makeAdminSession();
    const item = await makeListedItem(creator, admin);

    const suspended = await suspendContent(admin, item.id, "Takedown request");
    expect(suspended.status).toBe("suspended");
    expect(suspended.rights_status).toBe("SUSPENDED");
  });

  it("reinstating drives rights_status SUSPENDED -> LISTED and content_items.status back to approved", async () => {
    const creator = await makeCreatorSession();
    const admin = await makeAdminSession();
    const item = await makeListedItem(creator, admin);
    await suspendContent(admin, item.id);

    const reinstated = await reinstateContent(admin, item.id);
    expect(reinstated.status).toBe("approved");
    expect(reinstated.rights_status).toBe("LISTED");
  });

  it("rejects suspending content that isn't approved (e.g. still pending_review)", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    const admin = await makeAdminSession();

    await expect(suspendContent(admin, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects reinstating content that isn't suspended", async () => {
    const creator = await makeCreatorSession();
    const admin = await makeAdminSession();
    const item = await makeListedItem(creator, admin);

    await expect(reinstateContent(admin, item.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("suspending content not currently LISTED (e.g. LICENSING_ELIGIBLE, never listed) leaves rights_status untouched", async () => {
    const creator = await makeCreatorSession();
    const item = await createContentItem(creator, contentInput);
    await query(
      `INSERT INTO knowledge_assets (content_item_id, asset_type, summary, quality_score)
       VALUES ($1, 'knowledge_audit', 'summary', 50)`,
      [item.id]
    );
    await query("UPDATE content_items SET rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
    const admin = await makeAdminSession();
    await approveContent(admin, item.id);
    // Never listed — rights_status stays LICENSING_ELIGIBLE.

    const suspended = await suspendContent(admin, item.id);
    expect(suspended.status).toBe("suspended");
    expect(suspended.rights_status).toBe("LICENSING_ELIGIBLE");
  });

  it("writes audit log entries for suspend and reinstate", async () => {
    const creator = await makeCreatorSession();
    const admin = await makeAdminSession();
    const item = await makeListedItem(creator, admin);
    await suspendContent(admin, item.id);
    await reinstateContent(admin, item.id);

    const [suspendLog] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'content.moderate_suspend'",
      [item.id]
    );
    expect(suspendLog?.action).toBe("content.moderate_suspend");
    const [reinstateLog] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'content.moderate_reinstate'",
      [item.id]
    );
    expect(reinstateLog?.action).toBe("content.moderate_reinstate");
  });
});
