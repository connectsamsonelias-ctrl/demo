import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import {
  listCreatorProfilesForReview,
  listBuyerProfilesForReview,
  verifyCreatorProfile,
  rejectCreatorProfile,
  verifyBuyerProfile,
  rejectBuyerProfile,
} from "@/lib/admin/verification";
import { ForbiddenError, ValidationError, NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

async function makeAdminSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'admin') RETURNING id, email",
    [`admin-verification-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return { userId: user!.id, email: user!.email, role: "admin" };
}

async function makeCreatorSession(): Promise<{ session: Session; profileId: string }> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`admin-verification-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  const [profile] = await query<{ id: string }>(
    "INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator') RETURNING id",
    [user!.id]
  );
  return { session: { userId: user!.id, email: user!.email, role: "creator" }, profileId: profile!.id };
}

async function makeBuyerSession(): Promise<{ session: Session; profileId: string }> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'buyer') RETURNING id, email",
    [`admin-verification-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  const [profile] = await query<{ id: string }>(
    "INSERT INTO buyer_profiles (user_id, organization_name, organization_type) VALUES ($1, 'Acme AI Co', 'AI company') RETURNING id",
    [user!.id]
  );
  return { session: { userId: user!.id, email: user!.email, role: "buyer" }, profileId: profile!.id };
}

describe("listCreatorProfilesForReview / listBuyerProfilesForReview", () => {
  it("returns profiles with the owning user's email, and rejects a non-admin caller", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeCreatorSession();

    const profiles = await listCreatorProfilesForReview(admin);
    const found = profiles.find((p) => p.id === profileId);
    expect(found?.verification_status).toBe("unverified");
    expect(found?.email).toContain("@example.com");

    const { session: creator } = await makeCreatorSession();
    await expect(listCreatorProfilesForReview(creator)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listBuyerProfilesForReview(creator)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("verifyCreatorProfile / rejectCreatorProfile", () => {
  it("verifies an unverified profile", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeCreatorSession();

    const updated = await verifyCreatorProfile(admin, profileId);
    expect(updated.verification_status).toBe("verified");
  });

  it("rejects setting the same status twice in a row", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeCreatorSession();
    await verifyCreatorProfile(admin, profileId);

    await expect(verifyCreatorProfile(admin, profileId)).rejects.toBeInstanceOf(ValidationError);
  });

  it("allows changing a decision (verified -> rejected)", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeCreatorSession();
    await verifyCreatorProfile(admin, profileId);

    const updated = await rejectCreatorProfile(admin, profileId);
    expect(updated.verification_status).toBe("rejected");
  });

  it("404s for a nonexistent profile and rejects a non-admin caller", async () => {
    const admin = await makeAdminSession();
    await expect(verifyCreatorProfile(admin, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      NotFoundError
    );

    const { session: creator, profileId } = await makeCreatorSession();
    await expect(verifyCreatorProfile(creator, profileId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("writes an audit log entry", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeCreatorSession();
    await verifyCreatorProfile(admin, profileId);

    const [log] = await query<{ action: string; old_state: { verification_status: string }; new_state: { verification_status: string } }>(
      "SELECT action, old_state, new_state FROM audit_logs WHERE entity_id = $1 AND action = 'creator_profile.verification_review'",
      [profileId]
    );
    expect(log?.action).toBe("creator_profile.verification_review");
    expect(log?.old_state.verification_status).toBe("unverified");
    expect(log?.new_state.verification_status).toBe("verified");
  });
});

describe("verifyBuyerProfile / rejectBuyerProfile", () => {
  it("verifies and rejects independently from the creator-profile path", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeBuyerSession();

    const verified = await verifyBuyerProfile(admin, profileId);
    expect(verified.verification_status).toBe("verified");

    const rejected = await rejectBuyerProfile(admin, profileId);
    expect(rejected.verification_status).toBe("rejected");
  });

  it("writes an audit log entry distinct from the creator-profile action", async () => {
    const admin = await makeAdminSession();
    const { profileId } = await makeBuyerSession();
    await verifyBuyerProfile(admin, profileId);

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'buyer_profile.verification_review'",
      [profileId]
    );
    expect(log?.action).toBe("buyer_profile.verification_review");
  });
});
