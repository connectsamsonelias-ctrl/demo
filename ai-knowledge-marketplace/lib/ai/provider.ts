import Anthropic from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";
import { AnthropicAuditProvider } from "@/lib/ai/anthropic-provider";
import type { AuditInput, KnowledgeAuditResult } from "@/lib/ai/types";

export interface AIAuditProvider {
  /** Recorded verbatim into knowledge_assets.provenance — must reflect what actually ran, never a hardcoded assumption. */
  readonly modelId: string;
  generateAudit(input: AuditInput): Promise<KnowledgeAuditResult>;
}

/**
 * Default provider when no real one is configured. Deliberately throws
 * rather than returning fabricated data — a silent stub that invents a
 * plausible-looking audit would be actively misleading in a real
 * deployment. workers/audit/processor.ts catches this and records it as
 * a normal job failure with a clear error_message.
 */
export class NotConfiguredAIProvider implements AIAuditProvider {
  readonly modelId = "none";
  async generateAudit(): Promise<KnowledgeAuditResult> {
    throw new Error(
      "No AI provider is configured (ANTHROPIC_API_KEY is not set). Set it to enable the Knowledge Audit."
    );
  }
}

let override: AIAuditProvider | null = null;

/** Pass null to clear a test/dev override and go back to reading ANTHROPIC_API_KEY. */
export function setAIAuditProvider(p: AIAuditProvider | null): void {
  override = p;
}

/**
 * Resolves fresh from the environment on every call (unless overridden)
 * rather than caching a singleton at module load — constructing the
 * Anthropic client is cheap, and this keeps behavior correct if a test
 * flips the env between calls.
 */
export function getAIAuditProvider(): AIAuditProvider {
  if (override) return override;
  const apiKey = getEnv().ANTHROPIC_API_KEY;
  return apiKey ? new AnthropicAuditProvider(new Anthropic({ apiKey })) : new NotConfiguredAIProvider();
}
