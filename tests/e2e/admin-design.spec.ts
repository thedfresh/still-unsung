import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "../support/e2e";
import { seedSignedInUser } from "../support/auth-fixtures";
import { seedShowForReview } from "../support/show-review-seed";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function checkPage(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe("admin look", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  });

  test("every admin page has no violations and no sideways scroll", async ({ page }) => {
    const seeded = await seedShowForReview();
    const paths = [
      "/admin",
      "/admin/design",
      "/admin/lists",
      "/admin/lists/set-types",
      "/admin/shows",
      `/admin/shows/${seeded.showId}`,
      `/admin/shows/${seeded.showId}/edit`,
      "/admin/works",
      "/admin/people",
      "/admin/bands",
      "/admin/places",
      "/admin/changes",
      "/admin/changes/pending",
      "/admin/users",
      "/admin/tokens",
      "/admin/import-rules",
    ];
    for (const path of paths) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await checkPage(page);
    }
  });

  test("buttons and links on the home page are at least 44 px tall", async ({ page }) => {
    await page.goto("/admin");
    for (const control of await page.getByRole("main").getByRole("button").all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    for (const link of await page.getByRole("navigation", { name: "Admin" }).getByRole("link").all()) {
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  });
});

test.describe("gallery of admin parts", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  });

  test("shows each part in its states", async ({ page }) => {
    await page.goto("/admin/design");
    for (const name of ["Buttons", "Form fields", "Page header, card, row and table", "Messages"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    for (const variant of ["primary", "secondary", "quiet", "danger"]) {
      await expect(page.getByRole("button", { name: `Save ${variant}`, exact: true })).toBeEnabled();
      await expect(page.getByRole("button", { name: `Disabled ${variant}` })).toBeDisabled();
      const busy = page.getByRole("button", { name: `Busy ${variant}` });
      await expect(busy).toBeDisabled();
      await expect(busy).toHaveAttribute("aria-busy", "true");
    }
    await expect(page.getByRole("alert").filter({ hasText: "The save was refused" })).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible();
    await expect(page.getByText("Your version of show 12")).toBeVisible();
    await expect(page.getByText("Stored version")).toBeVisible();
    for (const badge of ["in use by 3", "private", "certain", "uncertain"]) {
      await expect(page.getByText(badge, { exact: true }).first()).toBeVisible();
    }
  });

  test("the form fields work with the keyboard and show a focus ring", async ({ page }) => {
    await page.goto("/admin/design");
    const text = page.getByLabel("Text field");
    await text.click();
    await expect(text).toBeFocused();
    expect(await text.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
    await page.keyboard.type("hello");
    await expect(text).toHaveValue("hello");
    const check = page.getByLabel("A checkbox");
    await check.focus();
    await page.keyboard.press("Space");
    await expect(check).toBeChecked();
    const first = page.getByLabel("First radio");
    await first.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByLabel("Second radio")).toBeChecked();
    await expect(page.getByLabel("Field with an error")).toHaveAttribute("aria-invalid", "true");
  });

  test("the gallery shows the save button in green with its states", async ({ page }) => {
    await page.goto("/admin/design");
    const save = page.getByRole("button", { name: "Save save", exact: true });
    await expect(save).toHaveCSS("background-color", "rgb(74, 102, 23)");
    await expect(page.getByRole("button", { name: "Disabled save", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Busy save", exact: true })).toHaveAttribute("aria-busy", "true");
  });

  test("a button takes the keyboard and the touch target is 44 px", async ({ page }) => {
    await page.goto("/admin/design");
    const button = page.getByRole("button", { name: "Save primary", exact: true });
    await button.focus();
    await expect(button).toBeFocused();
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });
});
