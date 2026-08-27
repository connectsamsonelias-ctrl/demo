/**
 * Milestone 18 (security hardening): a real, restrictive Content-Security-Policy
 * plus the standard defense-in-depth headers. Verified with a live headless-
 * browser load (Playwright) of the signed-in creator/buyer/admin dashboards
 * and the public marketplace — not just a curl header check — to confirm
 * this CSP doesn't break the app before shipping it.
 *
 * `script-src`/`style-src` still need 'unsafe-inline': Next.js's App Router
 * injects inline bootstrap/hydration scripts and React can emit inline
 * style attributes, and this app doesn't yet generate per-request CSP
 * nonces (that requires threading a nonce through middleware into every
 * page's <head>, real added complexity). This is a real, stated tradeoff,
 * not an oversight — a stricter nonce-based script-src is real follow-up
 * work, not solved here. Everything else in the policy is as strict as
 * this app actually needs: no external script/style/font/frame sources,
 * no plugins, no framing by other sites, forms only submit back to this
 * origin.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  // HTTPS-only in production; harmless over local HTTP dev (browsers
  // simply ignore it on a non-HTTPS origin).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Belt-and-suspenders with frame-ancestors above — X-Frame-Options is
  // ignored by CSP-aware browsers but still helps on old ones.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
