import { defineConfig, devices } from "@playwright/test";
import { config as loadEnv } from "dotenv";
import { assertTestDatabase } from "./tests/support/assert-test-database";
import { FAKE_GOOGLE_CLIENT_ID, FAKE_GOOGLE_PORT } from "./tests/support/fake-google";

// The browser tests write users and sessions, so they run against the test database only:
// .env.test, or the address that CI sets. A value already in the environment wins.
loadEnv({ path: ".env.test", quiet: true });
if (!process.env.BASE_URL) assertTestDatabase(process.env.DATABASE_URL);

const port = Number(process.env.PORT ?? 3100);
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: { baseURL, trace: "retain-on-failure" },
  // Every page is checked at phone, tablet and desktop widths (mobile-first standard).
  projects: [
    { name: "phone", use: { ...devices["Pixel 7"] } },
    { name: "tablet", use: { ...devices["iPad (gen 7)"], browserName: "chromium" } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  // Runs against the production build. Skipped when BASE_URL points at a deployed site.
  webServer: process.env.BASE_URL
    ? undefined
    : [
        {
          command: `npm run start -- --port ${port}`,
          url: `${baseURL}/api/health`,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          // Test-only sign-in settings. Not secrets. Google is a fake (tests/support/fake-google.ts).
          env: {
            AUTH_SECRET: "e2e-only-secret-not-used-anywhere-else",
            AUTH_TRUST_HOST: "true",
            AUTH_GOOGLE_ID: FAKE_GOOGLE_CLIENT_ID,
            AUTH_GOOGLE_SECRET: "e2e-client-secret",
            AUTH_GOOGLE_ISSUER: `http://localhost:${FAKE_GOOGLE_PORT}`,
          },
        },
        {
          command: "node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON tests/support/fake-google-server.ts",
          url: `http://localhost:${FAKE_GOOGLE_PORT}/.well-known/openid-configuration`,
          reuseExistingServer: !process.env.CI,
        },
      ],
});
