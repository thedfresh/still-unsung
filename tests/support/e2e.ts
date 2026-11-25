import { test as base } from "@playwright/test";
import { randomBytes } from "node:crypto";

export { expect, type BrowserContext, type Page } from "@playwright/test";

/**
 * Playwright's `test`, where each test is a different client for the app's rate limiter. The
 * app reads the client address from `X-Forwarded-For` (as set by the proxy), so parallel
 * tests never share a limit.
 */
export const test = base.extend({
  extraHTTPHeaders: async ({}, provide) => {
    const [a, b, c] = randomBytes(3);
    await provide({ "x-forwarded-for": `10.${a}.${b}.${c}` });
  },
});
