import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "../support/e2e";
import { query, seedSignedInUser } from "../support/auth-fixtures";
import { seedShowForReview } from "../support/show-review-seed";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("signed out", () => {
  for (const path of ["/admin/shows", "/admin/shows/1"]) {
    test(`${path} reads no data and goes to sign in`, async ({ page, request }) => {
      const seeded = await seedShowForReview();
      await page.goto(path === "/admin/shows" ? path : `/admin/shows/${seeded.showId}`);
      await expect(page).toHaveURL(/\/admin\/sign-in$/);
      await expect(page.getByText(seeded.placeName)).toHaveCount(0);
      // The raw response of the show page holds none of its content either.
      const raw = await request.get(`/admin/shows/${seeded.showId}`, { maxRedirects: 0 });
      expect(await raw.text()).not.toContain(seeded.summaries[0]);
    });
  }
});

test.describe("admin", () => {
  test("opens a show from the list and reads it on one page", async ({ page, context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    const seeded = await seedShowForReview();

    await page.goto("/admin");
    await page.getByRole("navigation", { name: "Admin" }).getByRole("link", { name: "Shows" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Shows" })).toBeVisible();
    await page.getByLabel(/Search by date/).fill("1980-11-14");
    await expect(page).toHaveURL(/q=1980-11-14/);
    await expect(page.getByRole("link", { name: new RegExp(`1980-11-14, ${seeded.placeName}`) })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);

    await page.getByRole("link", { name: new RegExp(seeded.placeName) }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Show 1980-11-14, ${seeded.placeName}` })).toBeVisible();

    // The segments come in reading order: the first one, its child, then the next one.
    const [first, second, child] = seeded.summaries;
    const articles = page.locator("main article");
    await expect(articles).toHaveCount(3);
    await expect(articles.nth(0)).toContainText(first);
    await expect(articles.nth(1)).toContainText(child);
    await expect(articles.nth(2)).toContainText(second);
    await expect(articles.nth(1).getByRole("heading", { level: 3 })).toContainText("1.1.");

    // A reference by name, a citation by source name, and the private marks.
    await expect(articles.nth(2).getByText(`work "${seeded.workTitle}"`)).toBeVisible();
    await expect(articles.nth(2).getByText(/Test Notebook/)).toBeVisible();
    await expect(articles.nth(2).getByRole("heading", { name: "Words as heard (private)" })).toBeVisible();
    await expect(articles.nth(2)).toContainText("Excerpt (private)");
    await expect(articles.nth(2)).toContainText("(private) A private note");

    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);
  });

  test("words as heard carry no (private) mark once they are public", async ({ page, context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    const seeded = await seedShowForReview();
    await page.goto(`/admin/shows/${seeded.showId}`);
    await expect(page.getByRole("heading", { name: "Words as heard (private)" })).toBeVisible();
    await query(`UPDATE segments SET "wordsPublic" = true WHERE "wordsAsHeard" = $1`, [seeded.wordsAsHeard]);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Words as heard", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Words as heard \(private\)/ })).toHaveCount(0);
  });

  test("a bad or unknown show ID returns HTTP 404 and the not-found page", async ({ page, context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    for (const path of ["/admin/shows/abc", "/admin/shows/2000000000"]) {
      const response = await page.goto(path);
      expect(response?.status()).toBe(404);
      await expect(page.getByText(/could not be found/i)).toBeVisible();
    }
  });
});
