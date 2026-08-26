import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { getBuyerProfile, upsertBuyerProfile } from "@/lib/buyer/profile";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeBuyerUser(): Promise<string> {
  const [user] = await query<{ id: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id",
    [`buyer-profile-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return user!.id;
}

describe("getBuyerProfile", () => {
  it("returns null when no profile has been created yet", async () => {
    const userId = await makeBuyerUser();
    await expect(getBuyerProfile(userId)).resolves.toBeNull();
  });
});

describe("upsertBuyerProfile", () => {
  it("creates a profile with defaults for omitted fields", async () => {
    const userId = await makeBuyerUser();
    const profile = await upsertBuyerProfile(userId, {
      organizationName: "Acme AI Co",
      organizationType: "AI company",
    });

    expect(profile.organization_name).toBe("Acme AI Co");
    expect(profile.organization_type).toBe("AI company");
    expect(profile.industry).toBeNull();
    expect(profile.use_case).toBeNull();
    expect(profile.verification_status).toBe("unverified");
  });

  it("is idempotent-ish: a second call updates the same row instead of creating a duplicate", async () => {
    const userId = await makeBuyerUser();
    await upsertBuyerProfile(userId, { organizationName: "Acme AI Co", organizationType: "AI company" });
    await upsertBuyerProfile(userId, { organizationName: "Acme AI Co (renamed)", organizationType: "AI company" });

    const rows = await query("SELECT id FROM buyer_profiles WHERE user_id = $1", [userId]);
    expect(rows).toHaveLength(1);

    const profile = await getBuyerProfile(userId);
    expect(profile!.organization_name).toBe("Acme AI Co (renamed)");
  });

  it("leaves omitted fields unchanged on update, replaces provided ones", async () => {
    const userId = await makeBuyerUser();
    await upsertBuyerProfile(userId, {
      organizationName: "Acme AI Co",
      organizationType: "AI company",
      industry: "software",
      useCase: "RAG training data",
    });

    const updated = await upsertBuyerProfile(userId, {
      organizationName: "Acme AI Co",
      organizationType: "AI company",
      industry: "fintech",
    });

    expect(updated.industry).toBe("fintech");
    expect(updated.use_case).toBe("RAG training data");
  });

  it("never writes a verification_status other than the column default, since callers cannot pass one", async () => {
    const userId = await makeBuyerUser();
    const profile = await upsertBuyerProfile(userId, {
      organizationName: "Acme AI Co",
      organizationType: "AI company",
    });
    expect(profile.verification_status).toBe("unverified");
  });
});
