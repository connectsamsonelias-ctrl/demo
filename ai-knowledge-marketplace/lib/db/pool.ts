import { Pool, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";

/**
 * Module-level singleton pool. Next.js dev-mode module reloads can otherwise
 * spawn a new pool per reload; cache it on `globalThis` to avoid exhausting
 * connections against a managed Postgres instance.
 */
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = new Pool({
      connectionString: getEnv().DATABASE_URL,
      max: 10,
    });
  }
  return globalThis.__pgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const result = await getPool().query<T>(text, params);
  return result.rows;
}

/**
 * Run a set of queries inside a single transaction. Callers pass a function
 * that receives a client bound to the transaction — every read/write in
 * this project that spans more than one statement (e.g. a rights-state
 * transition plus its audit-log write) must use this, not `query`.
 */
export async function withTransaction<T>(
  fn: (client: Pick<Pool, "query">) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
