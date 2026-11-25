import { describe, expect, it } from "vitest";
import { clientKey, RateLimiter } from "./rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit, then refuses until the window ends", () => {
    let now = 0;
    const limiter = new RateLimiter(3, 1000, () => now);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.allowed("a")).toBe(false);
    expect(limiter.hit("a")).toBe(false);
    now = 1000;
    expect(limiter.allowed("a")).toBe(true);
    expect(limiter.hit("a")).toBe(true);
  });

  it("counts each key on its own", () => {
    const limiter = new RateLimiter(1, 1000, () => 0);
    limiter.hit("a");
    expect(limiter.allowed("a")).toBe(false);
    expect(limiter.allowed("b")).toBe(true);
  });
});

describe("clientKey", () => {
  it("takes the last forwarded address, which the proxy added", () => {
    const headers = new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" });
    expect(clientKey(headers)).toBe("2.2.2.2");
  });

  it("falls back to x-real-ip, then to unknown", () => {
    expect(clientKey(new Headers({ "x-real-ip": "3.3.3.3" }))).toBe("3.3.3.3");
    expect(clientKey(new Headers())).toBe("unknown");
  });
});
