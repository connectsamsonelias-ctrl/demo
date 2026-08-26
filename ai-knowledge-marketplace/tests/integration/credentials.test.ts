import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createUserWithPassword, verifyCredentials, EmailAlreadyRegisteredError } from "@/lib/auth/credentials";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
});

function uniqueEmail() {
  return `integration-test-${crypto.randomUUID()}@example.com`;
}

describe("createUserWithPassword", () => {
  it("creates a user with a hashed password and writes an audit log", async () => {
    const email = uniqueEmail();
    const user = await createUserWithPassword(email, "correct horse battery staple", "creator");
    createdUserIds.push(user.id);

    expect(user.email).toBe(email);
    expect(user.role).toBe("creator");

    const [row] = await query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [user.id]
    );
    expect(row!.password_hash).not.toBe("correct horse battery staple");
    expect(row!.password_hash).toContain(":");

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'user.signup'",
      [user.id]
    );
    expect(log?.action).toBe("user.signup");
  });

  it("rejects a duplicate email", async () => {
    const email = uniqueEmail();
    const first = await createUserWithPassword(email, "correct horse battery staple", "buyer");
    createdUserIds.push(first.id);

    await expect(createUserWithPassword(email, "a different password", "creator")).rejects.toBeInstanceOf(
      EmailAlreadyRegisteredError
    );
  });
});

describe("verifyCredentials", () => {
  it("returns a session for correct credentials", async () => {
    const email = uniqueEmail();
    const user = await createUserWithPassword(email, "correct horse battery staple", "creator");
    createdUserIds.push(user.id);

    const session = await verifyCredentials(email, "correct horse battery staple");
    expect(session).toEqual({ userId: user.id, email, role: "creator" });
  });

  it("returns null for a wrong password without revealing that the account exists", async () => {
    const email = uniqueEmail();
    const user = await createUserWithPassword(email, "correct horse battery staple", "creator");
    createdUserIds.push(user.id);

    await expect(verifyCredentials(email, "wrong password")).resolves.toBeNull();
  });

  it("returns null for an email with no account", async () => {
    await expect(verifyCredentials(uniqueEmail(), "anything")).resolves.toBeNull();
  });

  it("returns null for a suspended account even with the correct password", async () => {
    const email = uniqueEmail();
    const user = await createUserWithPassword(email, "correct horse battery staple", "creator");
    createdUserIds.push(user.id);
    await query("UPDATE users SET status = 'suspended' WHERE id = $1", [user.id]);

    await expect(verifyCredentials(email, "correct horse battery staple")).resolves.toBeNull();
  });
});
