/**
 * Fixed-window, in-memory rate limiter. Deliberately minimal for the
 * MVP: it only protects a single process/instance, resets on restart,
 * and won't coordinate across multiple deployed instances. That's an
 * explicit limitation, not an oversight — swap for a shared store
 * (e.g. Redis) if/when the deployment becomes multi-instance.
 */
interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return true;
  }
  if (bucket.count >= limit) {
    return false;
  }
  bucket.count += 1;
  return true;
}
