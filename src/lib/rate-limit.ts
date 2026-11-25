/**
 * A fixed-window rate limiter that keeps its counts in memory. The app runs as one process
 * (docs/CONVENTIONS.md), so one map is enough. A restart clears the counts; that is acceptable
 * for brute-force protection.
 */
export class RateLimiter {
  private readonly windows = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** True when the key may act: it has used fewer than `max` hits in this window. */
  allowed(key: string): boolean {
    const entry = this.windows.get(key);
    if (!entry || this.now() - entry.start >= this.windowMs) return true;
    return entry.count < this.max;
  }

  /** Count one hit. Returns true when the key is still within the limit after it. */
  hit(key: string): boolean {
    const now = this.now();
    const entry = this.windows.get(key);
    if (!entry || now - entry.start >= this.windowMs) {
      this.prune(now);
      this.windows.set(key, { start: now, count: 1 });
      return this.max >= 1;
    }
    entry.count += 1;
    return entry.count <= this.max;
  }

  /** Drop the old windows, so the map cannot grow without limit. */
  private prune(now: number): void {
    if (this.windows.size < 1000) return;
    for (const [key, entry] of this.windows) {
      if (now - entry.start >= this.windowMs) this.windows.delete(key);
    }
  }
}

const globalForLimits = globalThis as unknown as {
  signInLimiter?: RateLimiter;
  tokenFailureLimiter?: RateLimiter;
};

/** Requests to the sign-in routes: 20 a minute for each client. */
export function signInLimiter(): RateLimiter {
  return (globalForLimits.signInLimiter ??= new RateLimiter(20, 60_000));
}

/** Wrong or revoked tokens: 10 a minute for each client, then every token check is refused. */
export function tokenFailureLimiter(): RateLimiter {
  return (globalForLimits.tokenFailureLimiter ??= new RateLimiter(10, 60_000));
}

/**
 * The client address for rate limiting. The proxy (nginx) appends the real address to
 * `X-Forwarded-For`, so the last entry is the one a client cannot forge.
 */
export function clientKey(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for");
  const last = forwarded?.split(",").at(-1)?.trim();
  return last || headers.get("x-real-ip")?.trim() || "unknown";
}
