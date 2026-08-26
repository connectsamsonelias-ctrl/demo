import { describe, it, expect } from "vitest";
import { knowledgeAuditResultSchema, qualityScoreFrom } from "@/lib/ai/types";

const validResult = {
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

describe("knowledgeAuditResultSchema", () => {
  it("accepts a fully valid result", () => {
    expect(knowledgeAuditResultSchema.safeParse(validResult).success).toBe(true);
  });

  it("defaults omitted array fields to empty arrays", () => {
    const { knowledgeExtraction, ...rest } = validResult;
    const { concepts: _c, ...restExtraction } = knowledgeExtraction;
    const parsed = knowledgeAuditResultSchema.safeParse({ ...rest, knowledgeExtraction: restExtraction });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.knowledgeExtraction.concepts).toEqual([]);
  });

  it("rejects a quality signal score out of 0-100 range", () => {
    const bad = { ...validResult, qualitySignals: { ...validResult.qualitySignals, depth: 150 } };
    expect(knowledgeAuditResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a non-integer quality signal score", () => {
    const bad = { ...validResult, qualitySignals: { ...validResult.qualitySignals, depth: 40.5 } };
    expect(knowledgeAuditResultSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects a missing summary", () => {
    const { summary: _drop, ...rest } = validResult;
    expect(knowledgeAuditResultSchema.safeParse(rest).success).toBe(false);
  });
});

describe("qualityScoreFrom", () => {
  it("averages the six quality signals", () => {
    // (40 + 70 + 60 + 50 + 30 + 55) / 6 = 305 / 6 = 50.83... -> rounds to 51
    expect(qualityScoreFrom(validResult)).toBe(51);
  });

  it("returns 0 when every signal is 0", () => {
    const allZero = { ...validResult, qualitySignals: { depth: 0, structure: 0, specificity: 0, expertiseSignals: 0, completeness: 0, consistency: 0 } };
    expect(qualityScoreFrom(allZero)).toBe(0);
  });

  it("returns 100 when every signal is 100", () => {
    const allMax = { ...validResult, qualitySignals: { depth: 100, structure: 100, specificity: 100, expertiseSignals: 100, completeness: 100, consistency: 100 } };
    expect(qualityScoreFrom(allMax)).toBe(100);
  });
});
