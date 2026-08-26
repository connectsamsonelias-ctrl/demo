import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import {
  createContentItem,
  listContentItemsForCreator,
  getContentItemForCreator,
  updateContentItem,
  OWNERSHIP_ATTESTATION_TEXT,
} from "@/lib/creator/content";
import { NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`content-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [
    user!.id,
  ]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

const validInput = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  sourcePlatform: "youtube",
  title: "How compressors work",
  category: "engineering",
  language: "en",
  ownershipAttested: true as const,
};

describe("createContentItem", () => {
  it("creates a content item at SUBMITTED / pending_review with the attestation recorded", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, validInput);

    expect(item.rights_status).toBe("SUBMITTED");
    expect(item.status).toBe("pending_review");
    expect(item.ownership_attestation_text).toBe(OWNERSHIP_ATTESTATION_TEXT);
    expect(item.ownership_attested_at).toBeTruthy();
    expect(item.title).toBe("How compressors work");
  });

  it("writes an audit log entry for the submission", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, validInput);

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'content.submit'",
      [item.id]
    );
    expect(log?.action).toBe("content.submit");
  });
});

describe("listContentItemsForCreator", () => {
  it("returns only the calling creator's own items", async () => {
    const owner = await makeCreatorSession();
    const other = await makeCreatorSession();
    await createContentItem(owner, validInput);
    await createContentItem(other, { ...validInput, title: "Someone else's content" });

    const ownerItems = await listContentItemsForCreator(owner);
    expect(ownerItems).toHaveLength(1);
    expect(ownerItems[0]!.title).toBe("How compressors work");
  });
});

describe("getContentItemForCreator", () => {
  it("allows the owner and rejects a different creator with NotFoundError", async () => {
    const owner = await makeCreatorSession();
    const item = await createContentItem(owner, validInput);

    await expect(getContentItemForCreator(owner, item.id)).resolves.toMatchObject({ id: item.id });

    const other = await makeCreatorSession();
    await expect(getContentItemForCreator(other, item.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updateContentItem", () => {
  it("updates only the provided fields, leaving the rest untouched", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, validInput);

    const updated = await updateContentItem(session, item.id, { title: "New title" });

    expect(updated.title).toBe("New title");
    expect(updated.category).toBe(validInput.category);
    expect(updated.language).toBe(validInput.language);
    expect(updated.source_url).toBe(validInput.sourceUrl);
  });

  it("never changes rights_status or moderation status — those fields aren't even accepted", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, validInput);
    const updated = await updateContentItem(session, item.id, { title: "New title" });

    expect(updated.rights_status).toBe("SUBMITTED");
    expect(updated.status).toBe("pending_review");
  });

  it("rejects an update from a different creator", async () => {
    const owner = await makeCreatorSession();
    const item = await createContentItem(owner, validInput);
    const other = await makeCreatorSession();

    await expect(updateContentItem(other, item.id, { title: "Hijacked" })).rejects.toBeInstanceOf(
      NotFoundError
    );

    // Confirm the row was genuinely untouched, not just that an error was thrown.
    const stillOwned = await getContentItemForCreator(owner, item.id);
    expect(stillOwned.title).toBe(validInput.title);
  });

  it("writes an audit log entry for the update", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, validInput);
    await updateContentItem(session, item.id, { title: "New title" });

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'content.update'",
      [item.id]
    );
    expect(log?.action).toBe("content.update");
  });
});
