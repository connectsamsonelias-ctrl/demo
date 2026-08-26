import { describe, it, expect } from "vitest";
import { buyerProfileSchema } from "@/lib/buyer/profile";

describe("buyerProfileSchema", () => {
  it("accepts a minimal valid payload (name + type only)", () => {
    const result = buyerProfileSchema.safeParse({
      organizationName: "Acme AI Co",
      organizationType: "AI company",
    });
    expect(result.success).toBe(true);
  });

  it("accepts a full valid payload", () => {
    const result = buyerProfileSchema.safeParse({
      organizationName: "Acme AI Co",
      organizationType: "AI company",
      industry: "software",
      useCase: "RAG training data",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing organizationName", () => {
    expect(buyerProfileSchema.safeParse({ organizationType: "AI company" }).success).toBe(false);
  });

  it("rejects a missing organizationType", () => {
    expect(buyerProfileSchema.safeParse({ organizationName: "Acme AI Co" }).success).toBe(false);
  });

  it("rejects an empty organizationName", () => {
    expect(
      buyerProfileSchema.safeParse({ organizationName: "   ", organizationType: "AI company" }).success
    ).toBe(false);
  });

  it("silently has no field for verification_status — it cannot be set through this schema", () => {
    const result = buyerProfileSchema.safeParse({
      organizationName: "Acme AI Co",
      organizationType: "AI company",
      verification_status: "verified",
    });
    expect(result.success).toBe(true);
    expect(result.success && "verification_status" in result.data).toBe(false);
  });
});
