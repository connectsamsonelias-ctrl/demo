import { describe, it, expect } from "vitest";
import { accessRequestSchema } from "@/lib/buyer/requests";

const validRequest = {
  contentItemId: "00000000-0000-0000-0000-000000000000",
  intendedUse: "RAG dataset for internal research",
  requestedScope: "internal use only",
};

describe("accessRequestSchema", () => {
  it("accepts a minimal valid payload", () => {
    expect(accessRequestSchema.safeParse(validRequest).success).toBe(true);
  });

  it("accepts an optional requestedDuration", () => {
    const result = accessRequestSchema.safeParse({ ...validRequest, requestedDuration: "1 year" });
    expect(result.success).toBe(true);
  });

  it("rejects a non-UUID contentItemId", () => {
    expect(accessRequestSchema.safeParse({ ...validRequest, contentItemId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects a missing intendedUse", () => {
    const { intendedUse: _drop, ...rest } = validRequest;
    expect(accessRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects a missing requestedScope", () => {
    const { requestedScope: _drop, ...rest } = validRequest;
    expect(accessRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("has no field for status — a client cannot set the request's status through this schema", () => {
    const result = accessRequestSchema.safeParse({ ...validRequest, status: "approved" });
    expect(result.success).toBe(true);
    expect(result.success && "status" in result.data).toBe(false);
  });
});
