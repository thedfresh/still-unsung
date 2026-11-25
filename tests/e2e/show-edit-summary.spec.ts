import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "../support/e2e";
import { seedSignedInUser } from "../support/auth-fixtures";
import { seedShowForReview } from "../support/show-review-seed";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("an admin edits a segment summary, sees it on the Changes page, and a stale tab gets the conflict", async ({ page, context, baseURL }) => {
  const admin = await seedSignedInUser("ADMIN");
  await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  const seeded = await seedShowForReview();
  const url = `/admin/shows/${seeded.showId}`;
  const [first] = seeded.summaries;

  await page.goto(url);
  // A second tab reads the same version of the segment.
  const stale = await context.newPage();
  await stale.goto(url);

  // The first article in reading order is segment 1. A filter on its text would stop matching while it is edited.
  const article = page.locator("main article").nth(0);
  await article.getByRole("button", { name: /^Edit summary of segment 1$/ }).click();
  const box = article.getByRole("textbox", { name: "Summary" });
  await expect(box).toHaveValue(first);
  await box.fill("A new summary from the admin.");
  await expect(article.getByText("29 of 300 characters")).toBeVisible();
  await expect(article.getByLabel("My own knowledge")).toBeChecked();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await article.getByRole("button", { name: "Save" }).click();

  // The editor closes and the page shows the new text as a paragraph.
  // The button reads "Saving…" while the save runs, so wait for the form itself to go.
  await expect(article.getByRole("textbox")).toHaveCount(0);
  await expect(article.getByText("A new summary from the admin.", { exact: true })).toBeVisible();
  await expect(page.getByText(first, { exact: true })).toHaveCount(0);

  // The Changes page lists it with the user and the evidence.
  await page.goto("/admin/changes");
  const change = page.locator("details", { hasText: admin.email }).first();
  await expect(change.locator("summary")).toContainText("Evidence: own knowledge");
  await expect(change.locator("summary")).toContainText("(ADMIN)");
  await change.locator("summary").click();
  await expect(change).toContainText("A new summary from the admin.");

  // The stale tab still holds the old version: its save writes nothing and shows both texts.
  const old = stale.locator("main article").nth(0);
  await old.getByRole("button", { name: /^Edit summary of segment 1$/ }).click();
  await old.getByRole("textbox", { name: "Summary" }).fill("Stale text.");
  await old.getByRole("button", { name: "Save" }).click();
  const alert = old.getByRole("alert");
  await expect(alert).toContainText("changed since you opened it");
  await expect(alert).toContainText("“Stale text.”");
  await expect(alert).toContainText("“A new summary from the admin.”");
  await stale.reload();
  await expect(stale.getByText("Stale text.")).toHaveCount(0);
});

test("the evidence picker refuses an ID that is not a number", async ({ page, context, baseURL }) => {
  const admin = await seedSignedInUser("ADMIN");
  await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  const seeded = await seedShowForReview();
  await page.goto(`/admin/shows/${seeded.showId}`);
  const article = page.locator("main article").nth(0);
  await article.getByRole("button", { name: /^Edit summary of segment 1$/ }).click();
  await article.getByLabel("A source, a recording or a contributor").check();
  await article.getByLabel("Source ID").fill("not a number");
  await article.getByRole("button", { name: "Save" }).click();
  await expect(article.getByRole("alert")).toContainText("whole number");
});
