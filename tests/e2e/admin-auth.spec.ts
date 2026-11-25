import AxeBuilder from "@axe-core/playwright";
import { expect, test, type BrowserContext, type Page } from "../support/e2e";
import { EMAIL_COOKIE, UNVERIFIED_COOKIE } from "../support/fake-google";
import { countUsers, seedSignedInUser, seedUser, uniqueEmail } from "../support/auth-fixtures";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];


async function signInAs(context: BrowserContext, baseURL: string, sessionToken: string) {
  await context.addCookies([{ name: "authjs.session-token", value: sessionToken, url: baseURL }]);
}

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("signed out", () => {
  test("the sign-in page offers Google and a passkey, and passes axe", async ({ page }) => {
    await page.goto("/admin/sign-in");
    await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign in with a passkey" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations).toEqual([]);
    await noSidewaysScroll(page);
  });

  for (const path of ["/admin", "/admin/users", "/admin/tokens"]) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/sign-in$/);
    });
  }

  test("the API refuses a request with no sign-in", async ({ request }) => {
    const res = await request.get("/api/v1/me");
    expect(res.status()).toBe(401);
    expect((await res.json()).error.code).toBe("unauthorized");
  });

  test("every response has the security headers", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.headers()["x-content-type-options"]).toBe("nosniff");
    expect(res.headers()["x-frame-options"]).toBe("DENY");
    expect(res.headers()["referrer-policy"]).toBeTruthy();
    expect(res.headers()["strict-transport-security"]).toContain("max-age=");
    expect(res.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  });

  test("sign-in requests are rate limited for each client", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await request.get("/api/auth/providers")).status());
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  test("wrong tokens are refused, then limited", async ({ request }) => {
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) {
      statuses.push((await request.get("/api/v1/me", { headers: { Authorization: "Bearer suat_wrong" } })).status());
    }
    expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });
});

test.describe("wrong role", () => {
  test("an agent session cannot open the admin pages", async ({ page, context, baseURL }) => {
    const agent = await seedSignedInUser("AGENT");
    await signInAs(context, baseURL!, agent.sessionToken);
    await page.goto("/admin/users");
    await expect(page).toHaveURL(/\/admin\/sign-in\?error=AccessDenied$/);
    await expect(page.locator("main [role=alert]")).toContainText("cannot sign in");
  });
});

test.describe("admin", () => {
  test("the pages load, pass axe and do not scroll sideways", async ({ page, context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await signInAs(context, baseURL!, admin.sessionToken);
    for (const path of ["/admin", "/admin/users", "/admin/tokens"]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(page.getByText(`Signed in as ${admin.email}`)).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
      expect(results.violations).toEqual([]);
      await noSidewaysScroll(page);
    }
  });

  test("adds a user and removes them", async ({ page, context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await signInAs(context, baseURL!, admin.sessionToken);
    const email = uniqueEmail("new-user");
    await page.goto("/admin/users");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Role").selectOption("AGENT");
    await page.getByRole("button", { name: "Add user" }).click();
    const row = page.getByRole("row", { name: new RegExp(email) });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: /Remove/ }).click();
    await expect(page.getByRole("row", { name: new RegExp(email) })).toHaveCount(0);
  });

  test("makes a token once, the agent uses it, and revoking stops it", async ({ page, context, baseURL, request }) => {
    const admin = await seedSignedInUser("ADMIN");
    const agent = await seedSignedInUser("AGENT");
    await signInAs(context, baseURL!, admin.sessionToken);
    await page.goto("/admin/tokens");
    await page.getByLabel("Agent user").selectOption({ label: agent.email });
    await page.getByLabel("Label").fill("e2e token");
    await page.getByRole("button", { name: "Make token" }).click();
    const token = (await page.getByTestId("new-token").textContent())!;
    expect(token).toMatch(/^suat_/);

    const ok = await request.get("/api/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(ok.status()).toBe(200);
    expect(await ok.json()).toMatchObject({ email: agent.email, role: "AGENT", via: "token" });

    // A token never opens an admin page.
    const adminPage = await request.get("/admin/users", { headers: { Authorization: `Bearer ${token}` }, maxRedirects: 0 });
    expect(await adminPage.text()).not.toContain("Add a user");

    // The token appears in the list, never in full.
    await page.goto("/admin/tokens");
    await expect(page.getByText(token)).toHaveCount(0);
    await page.getByRole("button", { name: /Revoke e2e token/ }).first().click();
    await expect(page.getByRole("cell", { name: "Revoked" }).first()).toBeVisible();

    const revoked = await request.get("/api/v1/me", { headers: { Authorization: `Bearer ${token}` } });
    expect(revoked.status()).toBe(401);
  });

  test("the API shows the session user", async ({ context, baseURL, request }) => {
    const admin = await seedSignedInUser("ADMIN");
    await signInAs(context, baseURL!, admin.sessionToken);
    const res = await context.request.get(`${baseURL}/api/v1/me`);
    expect(await res.json()).toMatchObject({ email: admin.email, role: "ADMIN", via: "session" });
    expect((await request.get("/api/v1/me")).status()).toBe(401);
  });
});

// Staging runs behind nginx over HTTPS: the proxy sends these headers and the session cookie
// has the `__Secure-` name. A signed-in admin must reach the admin home, not the sign-in page
// (HSA-160).
test.describe("admin behind a reverse proxy", () => {
  test("a signed-in admin reaches /admin with forwarded headers", async ({ browser, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    const host = new URL(baseURL!).host;
    const context = await browser.newContext({
      baseURL,
      extraHTTPHeaders: {
        "x-forwarded-for": "203.0.113.7",
        "x-forwarded-proto": "https",
        "x-forwarded-host": host,
      },
    });
    try {
      await context.addCookies([
        { name: "__Secure-authjs.session-token", value: admin.sessionToken, domain: new URL(baseURL!).hostname, path: "/", secure: true },
        { name: "authjs.session-token", value: admin.sessionToken, url: baseURL! },
      ]);
      const page = await context.newPage();
      const session = await context.request.get("/api/auth/session");
      expect((await session.json()).user?.email).toBe(admin.email);
      await page.goto("/admin");
      await expect(page).toHaveURL(/\/admin$/);
      await expect(page.getByText(`Signed in as ${admin.email}`)).toBeVisible();
      // The sign-in page sends a signed-in admin on to the admin home.
      await page.goto("/admin/sign-in");
      await expect(page).toHaveURL(/\/admin$/);
    } finally {
      await context.close();
    }
  });
});

test.describe("Google sign-in (Google is a fake)", () => {
  async function chooseGoogleUser(context: BrowserContext, email: string, unverified = false) {
    await context.addCookies([
      { name: EMAIL_COOKIE, value: encodeURIComponent(email), domain: "localhost", path: "/" },
      { name: UNVERIFIED_COOKIE, value: unverified ? "1" : "0", domain: "localhost", path: "/" },
    ]);
  }

  test("a user an admin added signs in", async ({ page, context }) => {
    const email = uniqueEmail("google-known");
    await seedUser(email, "ADMIN");
    await chooseGoogleUser(context, email);
    await page.goto("/admin/sign-in");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page).toHaveURL(/\/admin$/);
    await expect(page.getByText(`Signed in as ${email}`)).toBeVisible();
  });

  test("an unknown email is refused and no user row is written", async ({ page, context }) => {
    const email = uniqueEmail("google-stranger");
    await chooseGoogleUser(context, email);
    await page.goto("/admin/sign-in");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page).toHaveURL(/\/admin\/sign-in\?error=/);
    await expect(page.locator("main [role=alert]")).toBeVisible();
    expect(await countUsers(email)).toBe(0);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/sign-in$/);
  });

  test("an email that Google did not verify is refused", async ({ page, context }) => {
    const email = uniqueEmail("google-unverified");
    await seedUser(email, "ADMIN");
    await chooseGoogleUser(context, email, true);
    await page.goto("/admin/sign-in");
    await page.getByRole("button", { name: "Sign in with Google" }).click();
    await expect(page).toHaveURL(/\/admin\/sign-in\?error=/);
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/admin\/sign-in$/);
  });
});
