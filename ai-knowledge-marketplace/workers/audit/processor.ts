import { getPool, withTransaction } from "@/lib/db/pool";
import { getAIAuditProvider } from "@/lib/ai/provider";
import { qualityScoreFrom } from "@/lib/ai/types";
import { recordAuditLog } from "@/lib/audit/log";
import { AUDIT_JOB_TYPE } from "@/lib/creator/audit";
import { assertValidRightsTransition } from "@/lib/rights/state-machine";
import type { ContentProcessingJobRow, ContentItemRow } from "@/lib/db/types";

const MAX_ATTEMPTS = 3;

export type ProcessResult =
  | { processed: false }
  | { processed: true; jobId: string; outcome: "succeeded" | "retrying" | "failed" };

/**
 * Claims and processes at most one queued audit job, then returns.
 * Claiming and processing are deliberately two separate transactions:
 * `FOR UPDATE SKIP LOCKED` only needs to hold the row lock long enough
 * to flip queued -> running, so a slow external AI call never blocks
 * other workers/instances from claiming other queued jobs. Callers loop
 * this (workers/audit/run.ts) or call it once per test.
 */
export async function processNextAuditJob(): Promise<ProcessResult> {
  const claimed = await withTransaction(async (client) => {
    const rows = await client.query<ContentProcessingJobRow>(
      `SELECT * FROM content_processing_jobs
       WHERE job_type = $1 AND status = 'queued'
       ORDER BY queued_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED`,
      [AUDIT_JOB_TYPE]
    );
    const job = rows.rows[0];
    if (!job) return null;

    const updated = await client.query<ContentProcessingJobRow>(
      `UPDATE content_processing_jobs
       SET status = 'running', started_at = now(), attempts = attempts + 1
       WHERE id = $1
       RETURNING *`,
      [job.id]
    );
    return updated.rows[0]!;
  });

  if (!claimed) return { processed: false };

  try {
    const contentRows = await getPool().query<ContentItemRow>("SELECT * FROM content_items WHERE id = $1", [
      claimed.content_item_id,
    ]);
    const contentItem = contentRows.rows[0];
    if (!contentItem) {
      throw new Error(`content_item ${claimed.content_item_id} no longer exists`);
    }
    // Literal implementation of spec Section 12's "eligibility/authorization check"
    // pipeline step. In practice every content item reaching a queued job should
    // already be AUTHORIZED_FOR_PROCESSING (requestAudit only enqueues after
    // createContentItem's auto-chain), but this is a defensive, testable gate
    // rather than an assumption — a job for a withdrawn/suspended item fails
    // cleanly (and retries/exhausts like any other failure) instead of silently
    // running an audit for content that isn't authorized to be processed.
    if (contentItem.rights_status !== "AUTHORIZED_FOR_PROCESSING") {
      throw new Error(
        `content_item ${contentItem.id} is not authorized for processing (rights_status='${contentItem.rights_status}')`
      );
    }

    const aiProvider = getAIAuditProvider();
    const result = await aiProvider.generateAudit({
      title: contentItem.title,
      description: contentItem.description,
      category: contentItem.category,
      language: contentItem.language,
      sourcePlatform: contentItem.source_platform,
    });

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO knowledge_assets
           (content_item_id, asset_type, summary, topics, skills, entities, structured_content, provenance, quality_score)
         VALUES ($1, 'knowledge_audit', $2, $3::jsonb, $4::jsonb, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
        [
          claimed.content_item_id,
          result.summary,
          JSON.stringify(result.knowledgeExtraction.concepts),
          JSON.stringify(result.knowledgeExtraction.skills),
          JSON.stringify(result.knowledgeExtraction.entities),
          JSON.stringify({
            contentOverview: result.contentOverview,
            procedures: result.knowledgeExtraction.procedures,
            terminology: result.knowledgeExtraction.terminology,
            examples: result.knowledgeExtraction.examples,
            qualitySignals: result.qualitySignals,
            potentialUseCases: result.potentialUseCases,
          }),
          JSON.stringify({
            model: aiProvider.modelId,
            input_basis: "metadata_only",
            generated_at: new Date().toISOString(),
          }),
          qualityScoreFrom(result),
        ]
      );
      await client.query(
        `UPDATE content_processing_jobs SET status = 'succeeded', completed_at = now() WHERE id = $1`,
        [claimed.id]
      );
      await recordAuditLog(
        {
          actorId: null,
          action: "content.audit_completed",
          entityType: "content_processing_jobs",
          entityId: claimed.id,
          metadata: { content_item_id: claimed.content_item_id },
        },
        client
      );

      // AUTHORIZED_FOR_PROCESSING -> LICENSING_ELIGIBLE, skipping ANALYSIS_COMPLETE
      // as a separately-persisted state — see lib/rights/state-machine.ts for why.
      assertValidRightsTransition(contentItem.rights_status, "LICENSING_ELIGIBLE");
      await client.query("UPDATE content_items SET rights_status = 'LICENSING_ELIGIBLE' WHERE id = $1", [
        contentItem.id,
      ]);
      await recordAuditLog(
        {
          actorId: null,
          action: "content.licensing_eligible",
          entityType: "content_items",
          entityId: contentItem.id,
          oldState: { rights_status: contentItem.rights_status },
          newState: { rights_status: "LICENSING_ELIGIBLE" },
        },
        client
      );
    });
    return { processed: true, jobId: claimed.id, outcome: "succeeded" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const willRetry = claimed.attempts < MAX_ATTEMPTS;
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE content_processing_jobs
         SET status = $2, error_message = $3
         WHERE id = $1`,
        [claimed.id, willRetry ? "queued" : "failed", message]
      );
      await recordAuditLog(
        {
          actorId: null,
          action: willRetry ? "content.audit_retry_scheduled" : "content.audit_failed",
          entityType: "content_processing_jobs",
          entityId: claimed.id,
          metadata: { content_item_id: claimed.content_item_id, error: message, attempts: claimed.attempts },
        },
        client
      );
    });
    return { processed: true, jobId: claimed.id, outcome: willRetry ? "retrying" : "failed" };
  }
}
