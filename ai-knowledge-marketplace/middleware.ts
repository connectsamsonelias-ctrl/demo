import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const WINDOW_MS = 60_000;
const LIMIT = 10;

/**
 * Rate-limits POST requests under /api/auth/* (signup, login submission,
 * signout) by client IP — a mandatory security requirement from the spec
 * for auth endpoints specifically. Runs on the Edge runtime (a Next.js
 * middleware constraint), so the in-memory limiter in lib/rate-limit.ts
 * is per-isolate, not globally coordinated; see that file's comment.
 */
export function middleware(request: NextRequest) {
  if (request.method !== "POST") return NextResponse.next();

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const allowed = checkRateLimit(`auth:${ip}`, LIMIT, WINDOW_MS);
  if (!allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Too many requests, try again shortly" } },
      { status: 429 }
    );
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/auth/:path*",
};
