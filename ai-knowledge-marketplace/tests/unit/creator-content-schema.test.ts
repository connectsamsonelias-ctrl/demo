import { describe, it, expect } from "vitest";
import { contentSubmissionSchema, contentUpdateSchema } from "@/lib/creator/content";

const validSubmission = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  sourcePlatform: "youtube",
  title: "How compressors work",
  category: "engineering",
  language: "en",
  ownershipAttested: true as const,
};

describe("contentSubmissionSchema", () => {
  it("accepts a valid full submission", () => {
    expect(contentSubmissionSchema.safeParse(validSubmission).success).toBe(true);
  });

  it("rejects a missing ownershipAttested field", () => {
    const { ownershipAttested: _drop, ...rest } = validSubmission;
    expect(contentSubmissionSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects ownershipAttested: false — the checkbox must be explicitly checked", () => {
    expect(
      contentSubmissionSchema.safeParse({ ...validSubmission, ownershipAttested: false }).success
    ).toBe(false);
  });

  it("rejects an invalid sourceUrl", () => {
    expect(
      contentSubmissionSchema.safeParse({ ...validSubmission, sourceUrl: "not a url" }).success
    ).toBe(false);
  });

  it("rejects a missing title/category/language/sourcePlatform", () => {
    for (const field of ["title", "category", "language", "sourcePlatform"] as const) {
      const { [field]: _drop, ...rest } = validSubmission;
      expect(contentSubmissionSchema.safeParse(rest).success, `missing ${field} should fail`).toBe(false);
    }
  });

  it("accepts an optional description and omits it cleanly when absent", () => {
    const withDesc = contentSubmissionSchema.safeParse({ ...validSubmission, description: "details" });
    expect(withDesc.success).toBe(true);
    const withoutDesc = contentSubmissionSchema.safeParse(validSubmission);
    expect(withoutDesc.success && withoutDesc.data.description).toBeUndefined();
  });
});

describe("contentUpdateSchema", () => {
  it("accepts an empty object (no-op update)", () => {
    expect(contentUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial update", () => {
    expect(contentUpdateSchema.safeParse({ title: "New title" }).success).toBe(true);
  });

  it("rejects an empty-string title", () => {
    expect(contentUpdateSchema.safeParse({ title: "" }).success).toBe(false);
  });

  it("has no field for sourceUrl or ownershipAttested — a client cannot resubmit or re-attest via PATCH", () => {
    const parsed = contentUpdateSchema.safeParse({
      title: "New title",
      sourceUrl: "https://evil.example/replaced",
      ownershipAttested: true,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "sourceUrl" in parsed.data).toBe(false);
    expect(parsed.success && "ownershipAttested" in parsed.data).toBe(false);
  });

  it("has no field for rights_status or status — a client cannot set moderation/rights state via PATCH", () => {
    const parsed = contentUpdateSchema.safeParse({
      title: "New title",
      rights_status: "ACTIVE",
      status: "approved",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "rights_status" in parsed.data).toBe(false);
    expect(parsed.success && "status" in parsed.data).toBe(false);
  });
});
