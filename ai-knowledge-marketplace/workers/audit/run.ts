import { processNextAuditJob } from "@/workers/audit/processor";

/**
 * Polling worker loop — `npm run worker:audit`. Postgres-table-backed,
 * no external queue broker, per the project's Milestone 1 decision to
 * keep background jobs boring at this scale. Run one or more instances;
 * `FOR UPDATE SKIP LOCKED` in processNextAuditJob() makes concurrent
 * instances safe (no double-processing).
 */
const POLL_INTERVAL_MS = 2000;

async function main() {
  console.log(`Audit worker started, polling every ${POLL_INTERVAL_MS}ms. Ctrl+C to stop.`);
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await processNextAuditJob();
    if (result.processed) {
      console.log(`job ${result.jobId}: ${result.outcome}`);
    } else {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
