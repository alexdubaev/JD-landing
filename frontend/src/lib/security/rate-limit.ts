type RateLimitPolicy = { limit: number; windowMs: number };
type Entry = { count: number; resetAt: number };

const entries = new Map<string, Entry>();

export function checkRateLimit(key: string, policy: RateLimitPolicy) {
  const now = Date.now();
  const current = entries.get(key);
  const entry = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + policy.windowMs }
    : current;

  entry.count += 1;
  entries.set(key, entry);
  return {
    allowed: entry.count <= policy.limit,
    retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
  };
}

export function resetRateLimits() {
  entries.clear();
}
