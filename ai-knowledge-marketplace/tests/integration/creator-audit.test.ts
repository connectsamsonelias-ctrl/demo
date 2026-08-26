import { afterEach, describe, expect, it } from "vitest";
import { query } from "@/lib/db/pool";
import { createContentItem } from "@/lib/creator/content";
import { requestAudit, getLatestAudit } from "@/lib/creator/audit";
import { processNextAuditJob } from "@/workers/audit/processor";
import { setAIAuditProvider, type AIAuditProvider } from "@/lib/ai/provider";
import type { AuditInput, KnowledgeAuditResult } from "@/lib/ai/types";
import { NotFoundError } from "@/lib/errors";
import type { Session } from "@/lib/auth/session";

let createdUserIds: string[] = [];

afterEach(async () => {
  await query("DELETE FROM users WHERE id = ANY($1::uuid[])", [createdUserIds]);
  createdUserIds = [];
  setAIAuditProvider(null);
});

async function makeCreatorSession(): Promise<Session> {
  const [user] = await query<{ id: string; email: string }>(
    "INSERT INTO users (email, role) VALUES ($1, 'creator') RETURNING id, email",
    [`audit-test-${crypto.randomUUID()}@example.com`]
  );
  createdUserIds.push(user!.id);
  await query("INSERT INTO creator_profiles (user_id, display_name) VALUES ($1, 'Test Creator')", [user!.id]);
  return { userId: user!.id, email: user!.email, role: "creator" };
}

const contentInput = {
  sourceUrl: "https://youtube.com/watch?v=abc123",
  sourcePlatform: "youtube",
  title: "How compressors work",
  category: "engineering",
  language: "en",
  ownershipAttested: true as const,
};

const stubResult: KnowledgeAuditResult = {
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

class StubProvider implements AIAuditProvider {
  readonly modelId = "stub-model";
  constructor(private impl: (input: AuditInput) => Promise<KnowledgeAuditResult>) {}
  generateAudit(input: AuditInput) {
    return this.impl(input);
  }
}

describe("requestAudit", () => {
  it("creates a queued job", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);

    const job = await requestAudit(session, item.id);
    expect(job.status).toBe("queued");
    expect(job.job_type).toBe("knowledge_audit");
    expect(job.attempts).toBe(0);
  });

  it("returns the existing job instead of creating a duplicate when one is already queued", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);

    const first = await requestAudit(session, item.id);
    const second = await requestAudit(session, item.id);
    expect(second.id).toBe(first.id);

    const rows = await query("SELECT id FROM content_processing_jobs WHERE content_item_id = $1", [item.id]);
    expect(rows).toHaveLength(1);
  });

  it("rejects a request for another creator's content", async () => {
    const owner = await makeCreatorSession();
    const item = await createContentItem(owner, contentInput);
    const other = await makeCreatorSession();

    await expect(requestAudit(other, item.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getLatestAudit", () => {
  it("returns null job/result before any audit is requested", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);

    await expect(getLatestAudit(session, item.id)).resolves.toEqual({ job: null, result: null });
  });
});

describe("processNextAuditJob", () => {
  it("does nothing when there are no queued jobs", async () => {
    await expect(processNextAuditJob()).resolves.toEqual({ processed: false });
  });

  it("processes a queued job end to end with a stub AI provider", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await requestAudit(session, item.id);

    setAIAuditProvider(new StubProvider(async () => stubResult));
    const outcome = await processNextAuditJob();
    expect(outcome).toMatchObject({ processed: true, outcome: "succeeded" });

    const status = await getLatestAudit(session, item.id);
    expect(status.job?.status).toBe("succeeded");
    expect(status.job?.completed_at).toBeTruthy();
    expect(status.result?.summary).toBe("A short summary.");
    expect(status.result?.quality_score).toBe("51.00"); // NUMERIC(5,2) comes back as this exact string
    expect(status.result?.provenance).toMatchObject({ model: "stub-model", input_basis: "metadata_only" });

    // A second poll finds nothing left to do.
    await expect(processNextAuditJob()).resolves.toEqual({ processed: false });
  });

  it("passes the content item's own metadata to the provider, not fabricated data", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, { ...contentInput, title: "A very specific title" });
    await requestAudit(session, item.id);

    let receivedInput: AuditInput | null = null;
    setAIAuditProvider(
      new StubProvider(async (input) => {
        receivedInput = input;
        return stubResult;
      })
    );
    await processNextAuditJob();

    expect(receivedInput).toMatchObject({ title: "A very specific title", category: "engineering", language: "en" });
  });

  it("retries on failure up to the attempt limit, then marks the job failed", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await requestAudit(session, item.id);

    setAIAuditProvider(
      new StubProvider(async () => {
        throw new Error("simulated provider failure");
      })
    );

    // Attempt 1: retried (queued again).
    let outcome = await processNextAuditJob();
    expect(outcome).toMatchObject({ outcome: "retrying" });
    let status = await getLatestAudit(session, item.id);
    expect(status.job?.status).toBe("queued");
    expect(status.job?.attempts).toBe(1);
    expect(status.job?.error_message).toContain("simulated provider failure");

    // Attempt 2: retried again.
    outcome = await processNextAuditJob();
    expect(outcome).toMatchObject({ outcome: "retrying" });
    status = await getLatestAudit(session, item.id);
    expect(status.job?.attempts).toBe(2);

    // Attempt 3: exhausts the retry budget (MAX_ATTEMPTS = 3) -> failed.
    outcome = await processNextAuditJob();
    expect(outcome).toMatchObject({ outcome: "failed" });
    status = await getLatestAudit(session, item.id);
    expect(status.job?.status).toBe("failed");
    expect(status.job?.attempts).toBe(3);

    // A failed job is not picked up again.
    await expect(processNextAuditJob()).resolves.toEqual({ processed: false });
  });

  it("records an audit log entry for a successful run", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    const job = await requestAudit(session, item.id);
    setAIAuditProvider(new StubProvider(async () => stubResult));
    await processNextAuditJob();

    const [log] = await query<{ action: string }>(
      "SELECT action FROM audit_logs WHERE entity_id = $1 AND action = 'content.audit_completed'",
      [job.id]
    );
    expect(log?.action).toBe("content.audit_completed");
  });

  it("never writes a knowledge_assets row when the provider fails", async () => {
    const session = await makeCreatorSession();
    const item = await createContentItem(session, contentInput);
    await requestAudit(session, item.id);
    setAIAuditProvider(
      new StubProvider(async () => {
        throw new Error("boom");
      })
    );
    await processNextAuditJob();

    const rows = await query("SELECT id FROM knowledge_assets WHERE content_item_id = $1", [item.id]);
    expect(rows).toHaveLength(0);
  });
});
