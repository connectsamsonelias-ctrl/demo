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
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
