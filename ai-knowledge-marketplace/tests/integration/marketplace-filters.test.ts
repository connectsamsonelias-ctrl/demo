import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { listContentOnMarketplace } from "@/lib/creator/listing";
import { listMarketplaceItems } from "@/lib/marketplace";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`marketplace-filter-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

async function makeListedItem(
  session: Session,
  overrides: {
    title: string;
    description?: string;
    category?: string;
    language?: string;
    topics?: string[];
    skills?: string[];
    qualityScore?: number;
  }
) {
  const item = await createContentItem(session, {
    sourceUrl: "https://youtube.com/watch?v=" + crypto.randomUUID(),
    sourcePlatform: "youtube",
    title: overrides.title,
    description: overrides.description,
    category: overrides.category ?? "engineering",
    language: overrides.language ?? "en",
    ownershipAttested: true,
  });
  await query(
    `INSERT INTO knowledge_assets
       (content_item_id, asset_type, summary, topics, skills, entities, structured_content, provenance, quality_score)
     VALUES ($1, 'knowledge_audit', 'summary', $2::jsonb, $3::jsonb, '[]'::jsonb, '{}'::jsonb, '{}'::jsonb, $4)`,
    [item.id, JSON.stringify(overrides.topics ?? []), JSON.stringify(overrides.skills ?? []), overrides.qualityScore ?? 50]
  );
  // Milestone 13: simulate the audit worker's rights_status advance, since
  // createContentItem now leaves new items at AUTHORIZED_FOR_PROCESSING.
  await query("UPDATE content_items SET status = 'approved', rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [item.id]);
  await listContentOnMarketplace(session, item.id);
  return item;
}

describe("listMarketplaceItems filters", () => {
  it("full-text search (q) matches title/description and excludes non-matches", async () => {
    const session = await makeCreatorSession();
    const match = await makeListedItem(session, { title: "How compressors work", description: "Industrial air compressors." });
    const nonMatch = await makeListedItem(session, { title: "Baking sourdough bread" });

    const results = await listMarketplaceItems({ q: "compressors" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(nonMatch.id);
  });

  it("category filter narrows to an exact match", async () => {
    const session = await makeCreatorSession();
    const match = await makeListedItem(session, { title: "A", category: "engineering" });
    const nonMatch = await makeListedItem(session, { title: "B", category: "cooking" });

    const results = await listMarketplaceItems({ category: "engineering" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(nonMatch.id);
  });

  it("language filter narrows to an exact match", async () => {
    const session = await makeCreatorSession();
    const match = await makeListedItem(session, { title: "A", language: "en" });
    const nonMatch = await makeListedItem(session, { title: "B", language: "fr" });

    const results = await listMarketplaceItems({ language: "en" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(nonMatch.id);
  });

  it("topic filter matches JSONB array containment", async () => {
    const session = await makeCreatorSession();
    const match = await makeListedItem(session, { title: "A", topics: ["compression ratio", "aftercooler"] });
    const nonMatch = await makeListedItem(session, { title: "B", topics: ["bread hydration"] });

    const results = await listMarketplaceItems({ topic: "compression ratio" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(nonMatch.id);
  });

  it("skill filter matches JSONB array containment", async () => {
    const session = await makeCreatorSession();
    const match = await makeListedItem(session, { title: "A", skills: ["diagnostics"] });
    const nonMatch = await makeListedItem(session, { title: "B", skills: ["kneading"] });

    const results = await listMarketplaceItems({ skill: "diagnostics" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(match.id);
    expect(ids).not.toContain(nonMatch.id);
  });

  it("minQuality filter excludes items below the threshold", async () => {
    const session = await makeCreatorSession();
    const high = await makeListedItem(session, { title: "High quality", qualityScore: 80 });
    const low = await makeListedItem(session, { title: "Low quality", qualityScore: 20 });

    const results = await listMarketplaceItems({ minQuality: 50 });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(high.id);
    expect(ids).not.toContain(low.id);
  });

  it("combines multiple filters with AND semantics", async () => {
    const session = await makeCreatorSession();
    const matchesBoth = await makeListedItem(session, { title: "A", category: "engineering", language: "en" });
    const wrongCategory = await makeListedItem(session, { title: "B", category: "cooking", language: "en" });
    const wrongLanguage = await makeListedItem(session, { title: "C", category: "engineering", language: "fr" });

    const results = await listMarketplaceItems({ category: "engineering", language: "en" });
    const ids = results.map((r) => r.id);
    expect(ids).toContain(matchesBoth.id);
    expect(ids).not.toContain(wrongCategory.id);
    expect(ids).not.toContain(wrongLanguage.id);
  });

  it("a SQL-injection-shaped q value is treated as a literal search term, not executed", async () => {
    const session = await makeCreatorSession();
    await makeListedItem(session, { title: "Safe item" });

    // Should not throw, and should not affect other tables.
    await expect(
      listMarketplaceItems({ q: "'; DROP TABLE users; --" })
    ).resolves.toBeDefined();

    const stillThere = await query<{ id: string }>("SELECT id FROM users WHERE id = $1", [session.userId]);
    expect(stillThere).toHaveLength(1);
  });
});
