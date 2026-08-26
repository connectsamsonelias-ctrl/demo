import { query } from "@/lib/db/pool";
import { assertOwnsContentItem } from "@/lib/auth/ownership";
import { recordAuditLog } from "@/lib/audit/log";
import type { Session } from "@/lib/auth/session";
import type { ContentProcessingJobRow, KnowledgeAssetRow } from "@/lib/db/types";

export const AUDIT_JOB_TYPE = "knowledge_audit";

const IN_FLIGHT_STATUSES = ["queued", "running"] as const;

/**
 * Creates a job for the async worker to pick up — never calls the AI
 * provider inline, per the spec's explicit rule that AI processing must
 * never block an HTTP request. Idempotent-ish: if a queued/running audit
 * job already exists for this content item, returns that instead of
 * creating a duplicate (avoids piling up redundant paid API calls if a
 * creator double-clicks "run audit").
 */
export async function requestAudit(session: Session, contentItemId: string): Promise<ContentProcessingJobRow> {
  await assertOwnsContentItem(session, contentItemId);

  const existing = await query<ContentProcessingJobRow>(
    `SELECT * FROM content_processing_jobs
     WHERE content_item_id = $1 AND job_type = $2 AND status = ANY($3)
     ORDER BY queued_at DESC LIMIT 1`,
    [contentItemId, AUDIT_JOB_TYPE, IN_FLIGHT_STATUSES]
  );
  if (existing[0]) return existing[0];

  const inserted = await query<ContentProcessingJobRow>(
    `INSERT INTO content_processing_jobs (content_item_id, job_type)
     VALUES ($1, $2)
     RETURNING *`,
    [contentItemId, AUDIT_JOB_TYPE]
  );
  const job = inserted[0]!;
  await recordAuditLog({
    actorId: session.userId,
    action: "content.audit_requested",
    entityType: "content_processing_jobs",
    entityId: job.id,
    metadata: { content_item_id: contentItemId },
  });
  return job;
}

export interface AuditStatus {
  job: ContentProcessingJobRow | null;
  result: KnowledgeAssetRow | null;
}

export async function getLatestAudit(session: Session, contentItemId: string): Promise<AuditStatus> {
  await assertOwnsContentItem(session, contentItemId);

  const jobs = await query<ContentProcessingJobRow>(
    `SELECT * FROM content_processing_jobs
     WHERE content_item_id = $1 AND job_type = $2
     ORDER BY queued_at DESC LIMIT 1`,
    [contentItemId, AUDIT_JOB_TYPE]
  );
  const job = jobs[0] ?? null;
  if (!job) return { job: null, result: null };

  const assets = await query<KnowledgeAssetRow>(
    `SELECT * FROM knowledge_assets
     WHERE content_item_id = $1 AND asset_type = 'knowledge_audit'
     ORDER BY created_at DESC LIMIT 1`,
    [contentItemId]
  );
  return { job, result: assets[0] ?? null };
}
