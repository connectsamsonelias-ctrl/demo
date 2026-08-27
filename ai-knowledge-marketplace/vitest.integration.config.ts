import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Separate config for tests that need a real Postgres instance with
 * migrations already applied. Kept out of the default `npm test` so unit
 * tests stay fast and DB-independent (see README "Design choices").
 * Run via `npm run test:integration` after `npm run migrate`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 15000,
    // These tests share one real Postgres database. Milestone 19 added
    // platform-wide aggregate queries (lib/admin/analytics.ts) that read
    // global row counts — running test files in parallel let another
    // file's concurrent insert/cleanup land between a test's own
    // before/after snapshots and flake the assertion. Every test file
    // was already written to clean up strictly its own rows, so this
    // isn't fixing a correctness bug in the app; it's removing a false
    // signal from testing global aggregates against a shared, actively-
    // mutated database.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
