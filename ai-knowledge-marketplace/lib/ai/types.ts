import { z } from "@/lib/validation";

/**
 * The Knowledge Audit output shape, matching the spec's Section 11
 * (Content overview / Knowledge extraction / Quality signals / Potential
 * use cases). Scores are 0-100 integers so they compose into a single
 * quality_score the same way content_items.quality_score already does.
 *
 * potentialUseCases is prose ("potential use"), never a promise of
 * commercial value — the spec is explicit the audit must not guarantee
 * demand.
 */
export const knowledgeAuditResultSchema = z.object({
  contentOverview: z.object({
    topic: z.string(),
    domain: z.string(),
    audience: z.string(),
    difficulty: z.string(),
  }),
  knowledgeExtraction: z.object({
    concepts: z.array(z.string()).default([]),
    skills: z.array(z.string()).default([]),
    procedures: z.array(z.string()).default([]),
    entities: z.array(z.string()).default([]),
    terminology: z.array(z.string()).default([]),
    examples: z.array(z.string()).default([]),
  }),
  qualitySignals: z.object({
    depth: z.number().int().min(0).max(100),
    structure: z.number().int().min(0).max(100),
    specificity: z.number().int().min(0).max(100),
    expertiseSignals: z.number().int().min(0).max(100),
    completeness: z.number().int().min(0).max(100),
    consistency: z.number().int().min(0).max(100),
  }),
  potentialUseCases: z.array(z.string()).default([]),
  summary: z.string(),
});

export type KnowledgeAuditResult = z.infer<typeof knowledgeAuditResultSchema>;

export interface AuditInput {
  title: string;
  description: string | null;
  category: string;
  language: string;
  sourcePlatform: string;
}

export function qualityScoreFrom(result: KnowledgeAuditResult): number {
  const { depth, structure, specificity, expertiseSignals, completeness, consistency } =
    result.qualitySignals;
  return Math.round((depth + structure + specificity + expertiseSignals + completeness + consistency) / 6);
}
