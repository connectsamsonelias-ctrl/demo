import { describe, it, expect } from "vitest";
import { licensingTermsSchema } from "@/lib/creator/licensing-terms";

describe("licensingTermsSchema", () => {
  it("accepts an empty payload — every field is optional, with defaults applied downstream in setLicensingTerms", () => {
    const result = licensingTermsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts a full payload", () => {
    const result = licensingTermsSchema.safeParse({
      allowedUseTypes: ["RAG dataset", "fine-tuning"],
      licenseDuration: "1 year",
      geographicScope: "worldwide",
      commercialStatus: "commercial",
      pricingModel: "flat_fee",
      basePrice: 499.99,
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid commercialStatus value", () => {
    const result = licensingTermsSchema.safeParse({ commercialStatus: "not_a_real_status" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative basePrice", () => {
    const result = licensingTermsSchema.safeParse({ basePrice: -1 });
    expect(result.success).toBe(false);
  });

  it("has no fields for creator_share_percent or platform_share_percent — a client cannot set commission through this schema", () => {
    const result = licensingTermsSchema.safeParse({
      creatorSharePercent: 99,
      platformSharePercent: 1,
    });
    expect(result.success).toBe(true);
    expect(result.success && "creatorSharePercent" in result.data).toBe(false);
    expect(result.success && "platformSharePercent" in result.data).toBe(false);
  });
});
