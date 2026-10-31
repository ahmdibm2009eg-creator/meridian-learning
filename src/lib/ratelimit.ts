/**
 * Minimal fixed-window in-memory rate limiter for single-instance
 * deployments (the documented deployment mode of this build).
 *
 * Keyed by caller-chosen strings (e.g. `login:<ip>:<email>`). Not shared
 * across processes — documented limitation; swap for a Redis backend before
 * horizontally scaling.
 */
type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true, retryAfterSec: 0 };
  }
  b.count += 1;
  if (b.count > limit) {
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
  }
  return { ok: true, retryAfterSec: 0 };
}

/** Clear a bucket after a successful action (e.g. successful login). */
export function clearRateLimit(key: string) {
  buckets.delete(key);
}

// Periodic sweep so the map cannot grow without bound.
const g = globalThis as unknown as { __lmsRlSweep?: ReturnType<typeof setInterval> };
if (!g.__lmsRlSweep) {
  g.__lmsRlSweep = setInterval(() => {
    const now = Date.now();
    for (const [k, b] of buckets) if (b.resetAt < now) buckets.delete(k);
  }, 60_000);
  g.__lmsRlSweep.unref?.();
}
