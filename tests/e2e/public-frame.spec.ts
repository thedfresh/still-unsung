import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "../support/e2e";
import { seedSignedInUser } from "../support/auth-fixtures";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function noSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("home page frame", () => {
  test("shows the header, the footer and the license line", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("banner").getByRole("link", { name: "StillUnsung" })).toBeVisible();
    await expect(page.getByRole("contentinfo")).toContainText("CC BY 4.0, except where noted");
    await expect(page.getByRole("main")).toBeVisible();
  });

  test("has no WCAG 2.2 AA violations and no sideways scroll", async ({ page }) => {
    await page.goto("/");
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);
  });

  test("the skip link is the first stop and moves focus to the main area", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeFocused();
  });

  test("keyboard pass through the header", async ({ page }, testInfo) => {
    await page.goto("/");
    await page.keyboard.press("Tab"); // skip link
    await page.keyboard.press("Tab");
    await expect(page.getByRole("banner").getByRole("link", { name: "StillUnsung" })).toBeFocused();
    await page.keyboard.press("Tab");
    if (testInfo.project.name === "phone") {
      const menu = page.getByRole("button", { name: "Menu" });
      await expect(menu).toBeFocused();
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      // A closed menu keeps its links out of the tab order.
      await expect(page.getByRole("link", { name: "Home" })).toBeHidden();

      await page.keyboard.press("Enter");
      await expect(menu).toHaveAttribute("aria-expanded", "true");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Home" })).toBeFocused();

      await page.keyboard.press("Escape");
      await expect(menu).toHaveAttribute("aria-expanded", "false");
      await expect(menu).toBeFocused();
    } else {
      await expect(page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" })).toBeFocused();
      await expect(page.getByRole("button", { name: "Menu" })).toBeHidden();
    }
  });

  test("the open phone menu has no violations and no sideways scroll", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "phone", "The menu button shows on a phone only.");
    await page.goto("/");
    await page.getByRole("button", { name: "Menu" }).click();
    await expect(page.getByRole("link", { name: "Home" })).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);
  });
});

test.describe("design gallery", () => {
  test("is closed to a signed-out visitor", async ({ page }) => {
    await page.goto("/admin/design");
    await expect(page).toHaveURL(/\/admin\/sign-in$/);
  });

  test("shows the tokens and the five band themes, with no violations", async ({ page, context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    await page.goto("/admin/design");
    await expect(page.getByRole("heading", { level: 1, name: "Design" })).toBeVisible();
    for (const name of ["Colors", "Type", "Spacing, radius and shadow", "Band themes"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    for (const band of ["Robert Hunter", "Roadhog", "Comfort", "Dinosaurs", "Guest Appearances"]) {
      await expect(page.getByRole("heading", { level: 3, name: band })).toBeVisible();
    }
    expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
    await noSidewaysScroll(page);
  });
});
