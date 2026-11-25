import { describe, expect, it } from "vitest";
import { bearerToken, generateToken, hashToken, TOKEN_PREFIX } from "./tokens";

describe("tokens", () => {
  it("makes long, unique tokens with the prefix", () => {
    const a = generateToken();
    expect(a.startsWith(TOKEN_PREFIX)).toBe(true);
    expect(a.length).toBeGreaterThanOrEqual(48);
    expect(generateToken()).not.toBe(a);
  });

  it("hashes to a fixed 64-character value that does not contain the token", () => {
    const token = generateToken();
    const hash = hashToken(token);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).toBe(hashToken(token));
    expect(hash).not.toContain(token);
    expect(hashToken(token + "x")).not.toBe(hash);
  });

  it("reads a bearer token and nothing else", () => {
    expect(bearerToken("Bearer abc")).toBe("abc");
    expect(bearerToken("bearer abc")).toBe("abc");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer")).toBeNull();
    expect(bearerToken("Bearer a b")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });
});
