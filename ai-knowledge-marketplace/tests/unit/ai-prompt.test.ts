import { describe, it, expect } from "vitest";
import { AUDIT_SYSTEM_PROMPT, buildAuditUserPrompt } from "@/lib/ai/prompt";

describe("buildAuditUserPrompt", () => {
  it("includes every field from the input", () => {
    const prompt = buildAuditUserPrompt({
      title: "How compressors work",
      description: "A deep dive",
      category: "engineering",
      language: "en",
      sourcePlatform: "youtube",
    });
    expect(prompt).toContain("How compressors work");
    expect(prompt).toContain("A deep dive");
    expect(prompt).toContain("engineering");
    expect(prompt).toContain("en");
    expect(prompt).toContain("youtube");
  });

  it("handles a null description without crashing or printing 'null'", () => {
    const prompt = buildAuditUserPrompt({
      title: "Title",
      description: null,
      category: "cat",
      language: "en",
      sourcePlatform: "youtube",
    });
    expect(prompt).not.toContain("null");
    expect(prompt).toContain("none provided");
  });
});

describe("AUDIT_SYSTEM_PROMPT", () => {
  it("explicitly disclaims transcript access, so the model doesn't fabricate content it never saw", () => {
    expect(AUDIT_SYSTEM_PROMPT.toLowerCase()).toContain("do not have the actual video");
  });

  it("explicitly forbids guaranteeing commercial value, per the spec's requirement", () => {
    expect(AUDIT_SYSTEM_PROMPT.toLowerCase()).toContain("never state or imply a guaranteed commercial value");
  });
});
