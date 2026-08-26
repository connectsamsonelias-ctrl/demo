import { describe, it, expect } from "vitest";
import { AnthropicAuditProvider, type MessagesClient } from "@/lib/ai/anthropic-provider";

const validInput = {
  title: "How compressors work",
  description: "A deep dive into industrial air compressors.",
  category: "engineering",
  language: "en",
  sourcePlatform: "youtube",
};

const validJsonResult = {
  contentOverview: { topic: "Compressors", domain: "Engineering", audience: "Technicians", difficulty: "intermediate" },
  knowledgeExtraction: {
    concepts: ["compression ratio"],
    skills: ["diagnostics"],
    procedures: ["startup sequence"],
    entities: ["XR-4000"],
    terminology: ["aftercooler"],
    examples: ["E45 error code"],
  },
  qualitySignals: { depth: 40, structure: 70, specificity: 60, expertiseSignals: 50, completeness: 30, consistency: 55 },
  potentialUseCases: ["RAG dataset for technician support"],
  summary: "A short summary.",
};

function fakeClient(responseText: string): MessagesClient {
  return {
    messages: {
      create: async () => ({
        content: [{ type: "text", text: responseText }],
      }),
    },
  } as unknown as MessagesClient;
}

describe("AnthropicAuditProvider.generateAudit", () => {
  it("parses and validates a well-formed JSON response", async () => {
    const provider = new AnthropicAuditProvider(fakeClient(JSON.stringify(validJsonResult)));
    const result = await provider.generateAudit(validInput);
    expect(result.summary).toBe("A short summary.");
    expect(result.qualitySignals.depth).toBe(40);
  });

  it("throws a clear error when the response is not valid JSON", async () => {
    const provider = new AnthropicAuditProvider(fakeClient("this is not json"));
    await expect(provider.generateAudit(validInput)).rejects.toThrow(/not valid JSON/);
  });

  it("throws a clear error when JSON is valid but doesn't match the schema", async () => {
    const provider = new AnthropicAuditProvider(fakeClient(JSON.stringify({ foo: "bar" })));
    await expect(provider.generateAudit(validInput)).rejects.toThrow(/did not match the expected schema/);
  });

  it("throws when the response has no text content block", async () => {
    const client = {
      messages: { create: async () => ({ content: [{ type: "thinking", thinking: "..." }] }) },
    } as unknown as MessagesClient;
    const provider = new AnthropicAuditProvider(client);
    await expect(provider.generateAudit(validInput)).rejects.toThrow(/no text content/);
  });

  it("reports its model id for provenance", () => {
    const provider = new AnthropicAuditProvider(fakeClient("{}"));
    expect(provider.modelId).toBe("claude-haiku-4-5");
  });

  it("tolerates markdown-wrapped JSON being rejected rather than silently mis-parsed", async () => {
    // If the model ignores the "no markdown fences" instruction, we must
    // fail loudly (caught by workers/audit/processor.ts as a job
    // failure), not silently swallow the fences into garbage data.
    const provider = new AnthropicAuditProvider(fakeClient("```json\n" + JSON.stringify(validJsonResult) + "\n```"));
    await expect(provider.generateAudit(validInput)).rejects.toThrow(/not valid JSON/);
  });
});
