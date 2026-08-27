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
  // Optional, same reasoning: checkout creation fails closed (never
  // fabricates a checkout URL) without it. See lib/payments/provider.ts.
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  // Optional, but independently required from STRIPE_SECRET_KEY: webhook
  // signature verification fails closed (rejects every webhook, never
  // processes an unverifiable one) without it — a payment can be
  // confirmed with only this secret configured, even if checkout creation
  // itself is unconfigured.
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  // Milestone 20 (SEO/launch): the canonical public origin, used for
  // metadataBase, Open Graph URLs, sitemap.xml, and robots.txt. Optional
  // — falls back to a localhost placeholder so none of those break in
  // local dev; must be set to the real deployed origin in production
  // (same "real value needed before launch" category as NEXTAUTH_URL).
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
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

/** Never throws — every caller (metadata, sitemap, robots) needs a usable URL even in local dev with nothing configured. */
export function getSiteUrl(): string {
  return getEnv().NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}
