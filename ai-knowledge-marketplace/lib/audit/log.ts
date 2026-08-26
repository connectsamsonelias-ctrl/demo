import { query, type withTransaction } from "@/lib/db/pool";

export interface AuditLogEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  oldState?: unknown;
  newState?: unknown;
  metadata?: unknown;
}

/**
 * Every rights-sensitive state change (rights status, license status,
 * approval/rejection, payment confirmation, payout calculation, admin
 * action) must call this in the same transaction as the state change
 * itself — never as a fire-and-forget side effect that could silently
 * fail while the mutation succeeds. Pass a transaction client via
 * `client` when writing inside withTransaction(); omit it for a
 * standalone write.
 */
export async function recordAuditLog(
  entry: AuditLogEntry,
  client?: Parameters<Parameters<typeof withTransaction>[0]>[0]
): Promise<void> {
  const exec = client ?? { query: (text: string, params?: unknown[]) => query(text, params) };
  await exec.query(
    `INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, old_state, new_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      entry.actorId,
      entry.action,
      entry.entityType,
      entry.entityId,
      entry.oldState ? JSON.stringify(entry.oldState) : null,
      entry.newState ? JSON.stringify(entry.newState) : null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
  );
}
