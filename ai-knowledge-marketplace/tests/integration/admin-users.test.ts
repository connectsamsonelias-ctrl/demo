import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { listUsersForReview, suspendUser, reinstateUser } from "@/lib/admin/users";
import { verifyCredentials, createUserWithPassword } from "@/lib/auth/credentials";
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
    [`admin-users-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return { userId: user!.id, email: user!.email, role: "admin" };
}

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`admin-users-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

describe("listUsersForReview", () => {
  it("returns users without exposing password hashes, and rejects a non-admin caller", async () => {
    const admin = await makeAdminSession();
    const creator = await makeCreatorSession();

    const users = await listUsersForReview(admin);
    expect(users.some((u) => u.id === creator.userId)).toBe(true);
    expect(users[0] && "password_hash" in users[0]).toBe(false);

    await expect(listUsersForReview(creator)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("suspendUser / reinstateUser", () => {
  it("suspends an active user and blocks their login, then reinstates it", async () => {
    const admin = await makeAdminSession();
    const email = `admin-users-test-${crypto.randomUUID()}@example.com`;
    const created = await createUserWithPassword(email, "correct-horse-battery", "creator");
    createdUserIds.push(created.id);

    await expect(verifyCredentials(email, "correct-horse-battery")).resolves.toMatchObject({ userId: created.id });

    const suspended = await suspendUser(admin, created.id);
    expect(suspended.status).toBe("suspended");
    await expect(verifyCredentials(email, "correct-horse-battery")).resolves.toBeNull();

    const reinstated = await reinstateUser(admin, created.id);
    expect(reinstated.status).toBe("active");
    await expect(verifyCredentials(email, "correct-horse-battery")).resolves.toMatchObject({ userId: created.id });
  });

  it("refuses to suspend an admin account", async () => {
    const admin = await makeAdminSession();
    const otherAdmin = await makeAdminSession();
    await expect(suspendUser(admin, otherAdmin.userId)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects suspending an already-suspended user, and reinstating an already-active one", async () => {
    const admin = await makeAdminSession();
    const creator = await makeCreatorSession();
    await suspendUser(admin, creator.userId);

    await expect(suspendUser(admin, creator.userId)).rejects.toBeInstanceOf(ValidationError);
    await reinstateUser(admin, creator.userId);
    await expect(reinstateUser(admin, creator.userId)).rejects.toBeInstanceOf(ValidationError);
  });

  it("404s for a nonexistent user", async () => {
    const admin = await makeAdminSession();
    await expect(suspendUser(admin, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a non-admin cannot suspend or reinstate", async () => {
    const creator = await makeCreatorSession();
    const otherCreator = await makeCreatorSession();
    await expect(suspendUser(creator, otherCreator.userId)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(reinstateUser(creator, otherCreator.userId)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("writes audit log entries for suspend and reinstate", async () => {
    const admin = await makeAdminSession();
    const creator = await makeCreatorSession();
    await suspendUser(admin, creator.userId);
    await reinstateUser(admin, creator.userId);

    const [suspendLog] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'user.suspend'",
      [creator.userId]
    );
    expect(suspendLog?.action).toBe("user.suspend");
    const [reinstateLog] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'user.reinstate'",
      [creator.userId]
    );
    expect(reinstateLog?.action).toBe("user.reinstate");
  });
});
