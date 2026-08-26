import type Anthropic from "@anthropic-ai/sdk";
import { knowledgeAuditResultSchema, type AuditInput, type KnowledgeAuditResult } from "@/lib/ai/types";
import type { AIAuditProvider } from "@/lib/ai/provider";
import { AUDIT_SYSTEM_PROMPT, buildAuditUserPrompt } from "@/lib/ai/prompt";

/**
 * Claude Haiku 4.5 — chosen for cost, not capability ceiling: this is a
 * free, unauthenticated-cost, high-volume acquisition feature (every
 * creator who submits gets one), not a paid/premium path. See the
 * kickoff conversation for the cost comparison against Sonnet/Opus.
 */
const MODEL = "claude-haiku-4-5";
const MAX_TOKENS = 1500;

/** The slice of the Anthropic client this provider actually needs — narrow on purpose so tests can pass a fake without constructing a real SDK client. */
export type MessagesClient = Pick<Anthropic, "messages">;

/**
 * Plain-JSON-in-prompt + zod validation, not the API's structured-output
 * feature — deliberately: this project's TypeScript SDK usage patterns
 * weren't verified against current docs for that feature, and guessing
 * an unfamiliar request shape for a security/cost-relevant integration
 * is worse than the well-established, unambiguous fallback (ask for
 * JSON, validate what comes back, fail closed on anything that doesn't
 * parse). Revisit if structured outputs turn out to reduce parse
 * failures meaningfully in practice.
 */
export class AnthropicAuditProvider implements AIAuditProvider {
  readonly modelId = MODEL;

  constructor(private client: MessagesClient) {}

  async generateAudit(input: AuditInput): Promise<KnowledgeAuditResult> {
    const response = await this.client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      temperature: 0,
      system: AUDIT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildAuditUserPrompt(input) }],
    });

    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("AI provider returned no text content");
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(textBlock.text);
    } catch {
      throw new Error(`AI provider response was not valid JSON: ${textBlock.text.slice(0, 200)}`);
    }

    const result = knowledgeAuditResultSchema.safeParse(parsedJson);
    if (!result.success) {
      throw new Error(`AI provider response did not match the expected schema: ${result.error.message}`);
    }
    return result.data;
  }
}
