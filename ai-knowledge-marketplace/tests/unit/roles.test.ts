import { describe, it, expect } from "vitest";
import { isRole, ROLES } from "@/lib/auth/roles";

describe("isRole", () => {
  it("accepts every defined role", () => {
    for (const role of ROLES) {
      expect(isRole(role)).toBe(true);
    }
  });

  it("rejects 'visitor' — it is not a stored account role", () => {
    expect(isRole("visitor")).toBe(false);
  });

  it("rejects arbitrary/unauthorized strings", () => {
    expect(isRole("admin; DROP TABLE users;")).toBe(false);
    expect(isRole(123)).toBe(false);
    expect(isRole(undefined)).toBe(false);
  });
});
