import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "../support/e2e";
import { seedPublicShow } from "../support/public-show-seed";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("public show page", () => {
  test("renders the fixture show in the current layout and leaks nothing private", async ({ page, request }) => {
    const fixture = await seedPublicShow();
    await page.goto(`/shows/${fixture.slug}`);

    await expect(page.getByRole("heading", { level: 1 })).toContainText("November 14, 1980");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Test Radio");
    for (const name of ["Setlist", "Stage talk", "Show notes", "Recordings"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    // The standard view hides footnotes and fragments.
    await expect(page.getByRole("heading", { level: 2, name: "Footnotes" })).toHaveCount(0);
    await expect(page.getByText(fixture.workTitles.tease)).toHaveCount(0);
    await expect(page.getByRole("link", { name: /^Test Archive/ })).toHaveAttribute("href", /^https:\/\/example\.test\/details\/test-/);

    // The server HTML, with no JavaScript: everything public is there, nothing private is.
    for (const url of [`/shows/${fixture.slug}`, `/shows/${fixture.slug}?view=complete`]) {
      const html = await (await request.get(url)).text();
      for (const text of fixture.visible) expect(html, text).toContain(text);
      for (const secret of fixture.secret) expect(html, secret).not.toContain(secret);
      expect(html).toContain("application/ld+json");
    }
    const complete = await (await request.get(`/shows/${fixture.slug}?view=complete`)).text();
    for (const text of fixture.completeOnly) expect(complete, text).toContain(text);
  });

  test("the complete view adds fragments and numbered footnotes", async ({ page }) => {
    const fixture = await seedPublicShow();
    await page.goto(`/shows/${fixture.slug}?view=complete`);
    await expect(page.getByText(fixture.workTitles.tease)).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Footnotes" })).toBeVisible();
    await expect(page.getByText("last verse only")).toBeVisible();
    await expect(page.getByRole("link", { name: "Complete" })).toHaveAttribute("aria-current", "page");
  });

  test("an unknown slug is a real 404", async ({ request }) => {
    expect((await request.get("/shows/no-such-show-at-all")).status()).toBe(404);
  });

  test("has no WCAG 2.2 AA violations and no sideways scroll, in both views", async ({ page }) => {
    const fixture = await seedPublicShow();
    for (const url of [`/shows/${fixture.slug}`, `/shows/${fixture.slug}?view=complete`]) {
      await page.goto(url);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
      await noSidewaysScroll(page);
    }
  });

  test("keyboard pass: the view switch is reachable and works", async ({ page }) => {
    const fixture = await seedPublicShow();
    await page.goto(`/shows/${fixture.slug}`);
    const complete = page.getByRole("link", { name: "Complete" });
    let reached = false;
    for (let i = 0; i < 20 && !reached; i += 1) {
      await page.keyboard.press("Tab");
      reached = await complete.evaluate((el) => el === document.activeElement);
    }
    expect(reached).toBe(true);
    await expect(complete).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/view=complete$/);
    await expect(page.getByText(fixture.workTitles.tease)).toBeVisible();
  });
});
