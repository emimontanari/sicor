export interface RateLimiter {
  isLimited(key: string): boolean;
  fail(key: string): void;
  reset(key: string): void;
}

/** In-memory fixed-window failure counter (single-process; fine for one admin user). */
export function createRateLimiter(opts: { max: number; windowMs: number; now?: () => number }): RateLimiter {
  const now = opts.now ?? Date.now;
  const entries = new Map<string, { count: number; start: number }>();
  const live = (key: string) => {
    const e = entries.get(key);
    if (e && now() - e.start >= opts.windowMs) {
      entries.delete(key);
      return undefined;
    }
    return e;
  };
  return {
    isLimited: (key) => (live(key)?.count ?? 0) >= opts.max,
    fail(key) {
      const e = live(key);
      if (e) e.count += 1;
      else entries.set(key, { count: 1, start: now() });
    },
    reset: (key) => void entries.delete(key),
  };
}
