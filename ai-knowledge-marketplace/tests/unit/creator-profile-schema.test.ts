import { describe, it, expect } from "vitest";
import { creatorProfileSchema } from "@/lib/creator/profile";

describe("creatorProfileSchema", () => {
  it("accepts a minimal valid payload (displayName only)", () => {
    const result = creatorProfileSchema.safeParse({ displayName: "Ada Lovelace" });
    expect(result.success).toBe(true);
  });

  it("accepts a full valid payload", () => {
    const result = creatorProfileSchema.safeParse({
      displayName: "Ada Lovelace",
      bio: "Mathematician and writer.",
      expertise: ["mathematics", "computing"],
      languages: ["en"],
      links: ["https://example.com/ada"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a missing displayName", () => {
    expect(creatorProfileSchema.safeParse({ bio: "no name given" }).success).toBe(false);
  });

  it("rejects an empty displayName", () => {
    expect(creatorProfileSchema.safeParse({ displayName: "   " }).success).toBe(false);
  });

  it("rejects a non-URL entry in links", () => {
    const result = creatorProfileSchema.safeParse({
      displayName: "Ada",
      links: ["not a url"],
    });
    expect(result.success).toBe(false);
  });

  it("silently has no field for verification_status — it cannot be set through this schema", () => {
    const result = creatorProfileSchema.safeParse({
      displayName: "Ada",
      verification_status: "verified",
    });
    expect(result.success).toBe(true);
    // zod strips unknown keys by default — the malicious field never
    // survives parsing into the typed object the rest of the app sees.
    expect(result.success && "verification_status" in result.data).toBe(false);
  });
});
