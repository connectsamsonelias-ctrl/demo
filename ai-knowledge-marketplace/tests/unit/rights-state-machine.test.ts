import { describe, it, expect } from "vitest";
import {
  RIGHTS_STATUS_TRANSITIONS,
  isValidRightsTransition,
  assertValidRightsTransition,
} from "@/lib/rights/state-machine";
import { ValidationError } from "@/lib/errors";
import type { RightsStatus } from "@/lib/db/types";

const ALL_STATUSES: RightsStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "AUTHORIZATION_PENDING",
  "AUTHORIZED_FOR_PROCESSING",
  "ANALYSIS_COMPLETE",
  "LICENSING_ELIGIBLE",
  "LISTED",
  "LICENSE_REQUESTED",
  "LICENSED",
  "ACTIVE",
  "WITHDRAWN",
  "WITHDRAWAL_REQUESTED",
  "CONTRACTUAL_REVIEW",
  "SUSPENDED",
];

describe("RIGHTS_STATUS_TRANSITIONS", () => {
  it("has an entry for every rights_status enum value", () => {
    for (const status of ALL_STATUSES) {
      expect(RIGHTS_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("only lists edges to other known statuses", () => {
    for (const status of ALL_STATUSES) {
      for (const target of RIGHTS_STATUS_TRANSITIONS[status]) {
        expect(ALL_STATUSES).toContain(target);
      }
    }
  });

  it("has no direct ACTIVE -> WITHDRAWN edge — the only exit from ACTIVE goes through WITHDRAWAL_REQUESTED -> CONTRACTUAL_REVIEW", () => {
    expect(RIGHTS_STATUS_TRANSITIONS.ACTIVE).not.toContain("WITHDRAWN");
    expect(RIGHTS_STATUS_TRANSITIONS.ACTIVE).toEqual(["WITHDRAWAL_REQUESTED"]);
  });

  it("WITHDRAWN and terminal-looking states have no outgoing edges where nothing should reopen them", () => {
    expect(RIGHTS_STATUS_TRANSITIONS.WITHDRAWN).toEqual([]);
  });

  it("the only path from ACTIVE to WITHDRAWN is ACTIVE -> WITHDRAWAL_REQUESTED -> CONTRACTUAL_REVIEW -> WITHDRAWN", () => {
    expect(RIGHTS_STATUS_TRANSITIONS.WITHDRAWAL_REQUESTED).toEqual(["CONTRACTUAL_REVIEW"]);
    expect(RIGHTS_STATUS_TRANSITIONS.CONTRACTUAL_REVIEW).toEqual(["WITHDRAWN"]);
  });
});

describe("isValidRightsTransition", () => {
  it("accepts the edges this implementation actually exercises", () => {
    expect(isValidRightsTransition("SUBMITTED", "AUTHORIZED_FOR_PROCESSING")).toBe(true);
    expect(isValidRightsTransition("AUTHORIZED_FOR_PROCESSING", "LICENSING_ELIGIBLE")).toBe(true);
    expect(isValidRightsTransition("LICENSING_ELIGIBLE", "LISTED")).toBe(true);
    expect(isValidRightsTransition("LISTED", "WITHDRAWN")).toBe(true);
  });

  it("rejects skipping straight from SUBMITTED to LISTED", () => {
    expect(isValidRightsTransition("SUBMITTED", "LISTED")).toBe(false);
  });

  it("rejects going backwards", () => {
    expect(isValidRightsTransition("LISTED", "SUBMITTED")).toBe(false);
    expect(isValidRightsTransition("AUTHORIZED_FOR_PROCESSING", "SUBMITTED")).toBe(false);
  });

  it("rejects the direct ACTIVE -> WITHDRAWN shortcut", () => {
    expect(isValidRightsTransition("ACTIVE", "WITHDRAWN")).toBe(false);
  });

  it("rejects a no-op self-transition", () => {
    expect(isValidRightsTransition("LISTED", "LISTED")).toBe(false);
  });
});

describe("assertValidRightsTransition", () => {
  it("does not throw for a valid edge", () => {
    expect(() => assertValidRightsTransition("LICENSING_ELIGIBLE", "LISTED")).not.toThrow();
  });

  it("throws ValidationError, naming both states, for an invalid edge", () => {
    expect(() => assertValidRightsTransition("ACTIVE", "WITHDRAWN")).toThrow(ValidationError);
    try {
      assertValidRightsTransition("ACTIVE", "WITHDRAWN");
      throw new Error("expected assertValidRightsTransition to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidationError);
      expect((err as Error).message).toContain("ACTIVE");
      expect((err as Error).message).toContain("WITHDRAWN");
    }
  });
});
