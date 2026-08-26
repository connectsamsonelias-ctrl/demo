import { z } from "zod";

/**
 * Single validated source of truth for environment variables.
 * Nothing outside this file should read `process.env` directly —
 * that keeps a missing/malformed secret a startup-time failure,
 * not a runtime surprise inside a request handler.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Signs session JWTs — see .env.example for how to generate one.
  NEXTAUTH_SECRET: z.string().min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  // Optional, unlike the above: the app must still run (migrations, auth,
  // content submission, ...) without it configured. Only the AI Knowledge
  // Audit feature needs it, and it fails that one feature closed — not
  // the whole app — when absent. See lib/ai/provider.ts.
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid environment configuration:\n${parsed.error.issues
        .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
        .join("\n")}`
    );
  }
  cached = parsed.data;
  return cached;
}
