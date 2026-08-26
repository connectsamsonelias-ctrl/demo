import { describe, it, expect } from "vitest";
import { marketplaceFiltersSchema } from "@/lib/marketplace";

describe("marketplaceFiltersSchema", () => {
  it("accepts an empty object — no filters applied", () => {
    const result = marketplaceFiltersSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("accepts every filter field with a valid value", () => {
    const result = marketplaceFiltersSchema.safeParse({
      q: "compressors",
      category: "engineering",
      language: "en",
      topic: "compression ratio",
      skill: "diagnostics",
      minQuality: "50",
    });
    expect(result.success).toBe(true);
  });

  it("coerces minQuality from a query-string value to a number", () => {
    const result = marketplaceFiltersSchema.safeParse({ minQuality: "72" });
    expect(result.success).toBe(true);
    expect(result.success && result.data.minQuality).toBe(72);
  });

  it("rejects minQuality above 100", () => {
    expect(marketplaceFiltersSchema.safeParse({ minQuality: "150" }).success).toBe(false);
  });

  it("rejects minQuality below 0", () => {
    expect(marketplaceFiltersSchema.safeParse({ minQuality: "-1" }).success).toBe(false);
  });

  it("rejects a non-numeric minQuality", () => {
    expect(marketplaceFiltersSchema.safeParse({ minQuality: "not-a-number" }).success).toBe(false);
  });

  it("rejects an empty-string q rather than treating it as 'no filter'", () => {
    expect(marketplaceFiltersSchema.safeParse({ q: "" }).success).toBe(false);
  });
});
