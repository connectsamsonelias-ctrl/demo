import type { AuditInput } from "@/lib/ai/types";

/**
 * Tier 1 only (metadata-based), per the spec's cost-control staging
 * (Section 13). A real transcript is NOT fetched or included here — that
 * depends on the still-unresolved YouTube ingestion method decision
 * (docs/AI_KNOWLEDGE_LICENSING_SPECIFICATION.md, Step 2A). The prompt
 * says so explicitly so the model doesn't fabricate transcript-derived
 * claims it has no basis for.
 */
export const AUDIT_SYSTEM_PROMPT = `You are analyzing a piece of creator content to produce a "Knowledge Audit" \
for a rights-cleared AI/research licensing marketplace. You are given ONLY the \
creator-supplied title, description, category, language, and source platform — \
you do NOT have the actual video/audio/transcript. Do not invent specific facts, \
quotes, or details that could only come from watching or reading the actual content. \
Base your analysis strictly on what a reasonable person could infer from the \
metadata alone, and prefer general, qualified language over specific claims.

Never state or imply a guaranteed commercial value or guaranteed buyer demand — \
describe potential use cases as "potential", not certainties.

Respond with ONLY a single JSON object matching this exact shape, no other text, \
no markdown code fences:

{
  "contentOverview": { "topic": string, "domain": string, "audience": string, "difficulty": string },
  "knowledgeExtraction": {
    "concepts": string[], "skills": string[], "procedures": string[],
    "entities": string[], "terminology": string[], "examples": string[]
  },
  "qualitySignals": {
    "depth": integer 0-100, "structure": integer 0-100, "specificity": integer 0-100,
    "expertiseSignals": integer 0-100, "completeness": integer 0-100, "consistency": integer 0-100
  },
  "potentialUseCases": string[],
  "summary": string (one paragraph)
}

Since you only have metadata (not the actual content), "depth", "completeness" and \
"consistency" should generally score lower/more conservatively than "structure" or \
"specificity", reflecting genuine uncertainty rather than guessing confidently.`;

export function buildAuditUserPrompt(input: AuditInput): string {
  return [
    `Title: ${input.title}`,
    `Description: ${input.description ?? "(none provided)"}`,
    `Category: ${input.category}`,
    `Language: ${input.language}`,
    `Source platform: ${input.sourcePlatform}`,
  ].join("\n");
}
