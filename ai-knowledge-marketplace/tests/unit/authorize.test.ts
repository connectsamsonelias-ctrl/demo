import { describe, it, expect, afterEach } from "vitest";
import { requireRole, requireSession } from "@/lib/auth/authorize";
import { setAuthProvider, DevStubAuthProvider, type AuthProvider, type Session } from "@/lib/auth/session";
import { UnauthorizedError, ForbiddenError } from "@/lib/errors";

class StubProvider implements AuthProvider {
  constructor(private session: Session | null) {}
  async getSession() {
    return this.session;
  }
}

afterEach(() => {
  setAuthProvider(new DevStubAuthProvider());
});

describe("requireRole", () => {
  it("throws UnauthorizedError when there is no session", async () => {
    setAuthProvider(new StubProvider(null));
    await expect(requireRole(new Request("http://x"), ["admin"])).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it("throws ForbiddenError when the session role is not allowed", async () => {
    setAuthProvider(
      new StubProvider({ userId: "u1", email: "a@b.com", role: "creator" })
    );
    await expect(requireRole(new Request("http://x"), ["admin"])).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });

  it("returns the session when the role is allowed", async () => {
    const session: Session = { userId: "u1", email: "a@b.com", role: "buyer" };
    setAuthProvider(new StubProvider(session));
    await expect(requireRole(new Request("http://x"), ["buyer", "admin"])).resolves.toEqual(
      session
    );
  });
});

describe("requireSession", () => {
  it("throws UnauthorizedError when there is no session", async () => {
    setAuthProvider(new StubProvider(null));
    await expect(requireSession(new Request("http://x"))).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });
});
