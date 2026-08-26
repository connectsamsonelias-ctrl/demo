import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { getCreatorProfile, upsertCreatorProfile } from "@/lib/creator/profile";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeCreatorUser(): Promise<string> {
  const [user] = await query<{ id: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id",
    [`creator-profile-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return user!.id;
}

describe("getCreatorProfile", () => {
  it("returns null when no profile has been created yet", async () => {
    const userId = await makeCreatorUser();
    await expect(getCreatorProfile(userId)).resolves.toBeNull();
  });
});

describe("upsertCreatorProfile", () => {
  it("creates a profile with defaults for omitted fields", async () => {
    const userId = await makeCreatorUser();
    const profile = await upsertCreatorProfile(userId, { displayName: "Ada Lovelace" });

    expect(profile.display_name).toBe("Ada Lovelace");
    expect(profile.bio).toBeNull();
    expect(profile.expertise).toEqual([]);
    expect(profile.languages).toEqual([]);
    expect(profile.links).toEqual([]);
    expect(profile.verification_status).toBe("unverified");
  });

  it("is idempotent-ish: a second call updates the same row instead of creating a duplicate", async () => {
    const userId = await makeCreatorUser();
    await upsertCreatorProfile(userId, { displayName: "Ada Lovelace" });
    await upsertCreatorProfile(userId, { displayName: "Ada Lovelace (updated)" });

    const rows = await query("SELECT id FROM creator_profiles WHERE user_id = $1", [userId]);
    expect(rows).toHaveLength(1);

    const profile = await getCreatorProfile(userId);
    expect(profile!.display_name).toBe("Ada Lovelace (updated)");
  });

  it("leaves omitted fields unchanged on update, replaces provided ones", async () => {
    const userId = await makeCreatorUser();
    await upsertCreatorProfile(userId, {
      displayName: "Ada",
      bio: "original bio",
      expertise: ["mathematics"],
      languages: ["en"],
      links: ["https://example.com/a"],
    });

    // Second call only changes bio; every other field is omitted and
    // must survive unchanged.
    const updated = await upsertCreatorProfile(userId, { displayName: "Ada", bio: "new bio" });

    expect(updated.bio).toBe("new bio");
    expect(updated.expertise).toEqual(["mathematics"]);
    expect(updated.languages).toEqual(["en"]);
    expect(updated.links).toEqual(["https://example.com/a"]);
  });

  it("never writes a verification_status other than the column default, since callers cannot pass one", async () => {
    const userId = await makeCreatorUser();
    const profile = await upsertCreatorProfile(userId, { displayName: "Ada" });
    expect(profile.verification_status).toBe("unverified");
  });
});
