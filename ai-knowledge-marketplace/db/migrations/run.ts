import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { getPool } from "@/lib/db/pool";

/**
 * Minimal, dependency-free migration runner: applies every .sql file in
 * this directory, in filename order, that isn't already recorded in
 * schema_migrations. No down-migrations, no ORM — deliberately boring,
 * per the project's "prefer simple reliable systems" principle. If this
 * stops being enough (branching migrations, rollback needs), that is a
 * decision to revisit explicitly, not to silently work around.
 */
async function main() {
  const pool = getPool();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  const dir = __dirname;
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const { rows: applied } = await pool.query<{ filename: string }>(
    "SELECT filename FROM schema_migrations"
  );
  const appliedSet = new Set(applied.map((r) => r.filename));

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`skip  ${file} (already applied)`);
      continue;
    }
    const sql = readFileSync(path.join(dir, file), "utf8");
    console.log(`apply ${file}`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration failed: ${file}\n${(err as Error).message}`);
    } finally {
      client.release();
    }
  }

  console.log("Migrations up to date.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
