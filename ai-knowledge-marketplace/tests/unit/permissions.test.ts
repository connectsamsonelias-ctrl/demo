import { describe, it, expect } from "vitest";
import { can, ACTIONS, type Action } from "@/lib/auth/permissions";
import { ROLES } from "@/lib/auth/roles";

describe("can()", () => {
  it("grants creators their own-scoped content and licensing actions", () => {
    expect(can("creator", "content.create")).toBe(true);
    expect(can("creator", "content.set_licensing_terms_own")).toBe(true);
    expect(can("creator", "earnings.view_own")).toBe(true);
  });

  it("does not grant creators buyer or admin actions", () => {
    expect(can("creator", "access_request.create")).toBe(false);
    expect(can("creator", "user.suspend")).toBe(false);
  });

  it("grants buyers marketplace and access-request actions", () => {
    expect(can("buyer", "marketplace.browse")).toBe(true);
    expect(can("buyer", "access_request.create")).toBe(true);
  });

  it("does not grant buyers creator or admin actions", () => {
    expect(can("buyer", "content.create")).toBe(false);
    expect(can("buyer", "audit_log.view")).toBe(false);
  });

  it("grants admins review/moderation actions", () => {
    expect(can("admin", "content.moderate")).toBe(true);
    expect(can("admin", "user.suspend")).toBe(true);
    expect(can("admin", "audit_log.view")).toBe(true);
  });

  it("does not grant admins creator/buyer self-service actions", () => {
    expect(can("admin", "content.create")).toBe(false);
    expect(can("admin", "access_request.create")).toBe(false);
  });

  it("every action is assigned to at least one role (catches typos in the matrix)", () => {
    for (const action of ACTIONS as readonly Action[]) {
      const grantedToSomeone = ROLES.some((role) => can(role, action));
      expect(grantedToSomeone, `action "${action}" is not granted to any role`).toBe(true);
    }
  });
});
