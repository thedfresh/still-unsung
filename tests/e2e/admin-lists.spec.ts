import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "../support/e2e";
import { query, seedSignedInUser } from "../support/auth-fixtures";
import { seedShowForReview } from "../support/show-review-seed";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("signed out", () => {
  for (const path of ["/admin/lists", "/admin/lists/set-types"]) {
    test(`${path} goes to sign in and shows no list data`, async ({ page, request }) => {
      const seeded = await seedShowForReview();
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/sign-in$/);
      const raw = await request.get(path, { maxRedirects: 0 });
      expect(await raw.text()).not.toContain(seeded.setTypeName);
    });
  }
});

test.describe("admin", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  });

  test("the index names every list with its number of values", async ({ page }) => {
    await page.goto("/admin/lists");
    await expect(page.getByRole("heading", { level: 1, name: "Lists" })).toBeVisible();
    await expect(page.locator("main li")).toHaveCount(14);
    await expect(page.getByRole("link", { name: "Set types" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Reference kinds" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);
  });

  test("adds a set type, moves it up, and shows a used value as in use", async ({ page }) => {
    const seeded = await seedShowForReview();
    const name = `Late set ${randomBytes(3).toString("hex")}`;
    await page.goto("/admin/lists");
    await page.getByRole("link", { name: "Set types" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Set types" })).toBeVisible();

    await page.getByRole("textbox", { name: "Name", exact: true }).last().fill(name);
    await page.getByRole("textbox", { name: "Display name" }).last().fill("Late");
    await page.getByRole("button", { name: "Add set type" }).click();
    const mine = page.locator("main ol > li").filter({ hasText: name });
    await expect(mine).toHaveCount(1);

    const ids = async () => page.locator("main ol > li > p.font-semibold").allTextContents();
    const before = await ids();
    const at = before.indexOf(name);
    expect(at).toBeGreaterThan(0);
    const neighbour = before[at - 1];
    await mine.getByRole("button", { name: `Move up ${name}` }).click();
    await expect.poll(async () => (await ids()).indexOf(neighbour) - (await ids()).indexOf(name)).toBe(1);
    expect(await query(`SELECT 1 FROM changesets WHERE path = 'ADMIN' AND status = 'APPLIED'`)).not.toHaveLength(0);

    const used = page.locator("main ol > li").filter({ hasText: seeded.setTypeName });
    await expect(used.getByText(/In use by \d+ records?/)).toBeVisible();
    await expect(used.getByRole("button", { name: /^Delete/ })).toHaveCount(0);

    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);
  });

  test("renames a value in place and removes an unused one", async ({ page }) => {
    const name = `Scratch ${randomBytes(3).toString("hex")}`;
    await page.goto("/admin/lists/place-kinds");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("button", { name: "Add place kind" }).click();
    const row = page.locator("main ol > li").filter({ hasText: name });
    await expect(row).toHaveCount(1);

    await row.getByRole("button", { name: `Edit ${name}` }).click();
    await page.getByRole("form", { name: `Edit ${name}` }).getByRole("textbox", { name: "Name" }).fill(`${name} renamed`);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    const renamed = page.locator("main ol > li").filter({ hasText: `${name} renamed` });
    await expect(renamed).toHaveCount(1);

    await renamed.getByRole("button", { name: `Delete ${name} renamed` }).click();
    await renamed.getByRole("button", { name: `Confirm delete ${name} renamed` }).click();
    await expect(page.locator("main ol > li").filter({ hasText: `${name} renamed` })).toHaveCount(0);
  });

  test("shows a read-only rule key and an unknown list is a 404", async ({ page }) => {
    await query(`INSERT INTO reference_kinds (name, "ruleKey", position) VALUES ($1, $2, 99) ON CONFLICT DO NOTHING`, ["part of (test)", "test-part-of"]);
    await page.goto("/admin/lists/reference-kinds");
    const row = page.locator("main ol > li").filter({ hasText: "part of (test)" });
    await expect(row.getByText("test-part-of")).toBeVisible();
    await row.getByRole("button", { name: "Edit part of (test)" }).click();
    await expect(page.getByRole("form", { name: "Edit part of (test)" }).getByText(/cannot be changed here/)).toBeVisible();
    await expect(page.getByRole("form", { name: "Edit part of (test)" }).getByRole("textbox")).toHaveCount(1);

    const response = await page.goto("/admin/lists/not-a-list");
    expect(response?.status()).toBe(404);
  });
});
