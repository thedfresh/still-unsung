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

async function checkPage(page: Page) {
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
  await noSidewaysScroll(page);
}

/** Three works whose plain order differs from their sort order (leading articles are ignored). */
async function seedWorks(tag: string): Promise<number[]> {
  const kind = (await query<{ id: number }>(`INSERT INTO work_kinds (name) VALUES ($1) RETURNING id`, [`kind ${tag}`]))[0].id;
  const ids: number[] = [];
  for (const title of [`The Yak Song ${tag}`, `Wolf Song ${tag}`, `An Apple Tune ${tag}`]) {
    const entity = (await query<{ id: number }>(`INSERT INTO entities (kind) VALUES ('WORK') RETURNING id`))[0].id;
    await query(`INSERT INTO works (id, title, "workKindId", "updatedAt") VALUES ($1, $2, $3, now())`, [entity, title, kind]);
    ids.push(entity);
  }
  return ids;
}

test.describe("signed out", () => {
  for (const path of ["/admin/works", "/admin/people", "/admin/bands", "/admin/places"]) {
    test(`${path} reads no data and goes to sign in`, async ({ page, request }) => {
      const tag = randomBytes(3).toString("hex");
      await seedWorks(tag);
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/sign-in$/);
      const raw = await request.get(path, { maxRedirects: 0 });
      expect(await raw.text()).not.toContain(tag);
    });
  }

  test("the show editor and a record page read no data and go to sign in", async ({ page, request }) => {
    const seeded = await seedShowForReview();
    const [workId] = await seedWorks(randomBytes(3).toString("hex"));
    for (const path of [`/admin/shows/${seeded.showId}/edit`, `/admin/works/${workId}`]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin\/sign-in$/);
      const raw = await request.get(path, { maxRedirects: 0 });
      expect(await raw.text()).not.toContain(seeded.summaries[0]);
    }
  });
});

test.describe("admin", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  });

  test("the home page links every admin page and shows recent changes", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 2, name: "Recent changes" })).toBeVisible();
    for (const name of ["Shows", "Works", "People", "Bands", "Places", "Lists", "Changes", "Users", "Agent tokens", "Import rules", "Design"]) {
      await expect(page.getByRole("main").getByRole("list").getByRole("link", { name, exact: true })).toBeVisible();
    }
    await checkPage(page);
  });

  test("the lists sort without a leading article and open a record page", async ({ page }) => {
    const tag = randomBytes(3).toString("hex");
    await seedWorks(tag);
    await page.goto(`/admin/works?q=${tag}`);
    await expect(page.getByRole("heading", { level: 1, name: "Works" })).toBeVisible();
    const names = () => page.locator("main li a.font-semibold").allTextContents();
    expect(await names()).toEqual([`An Apple Tune ${tag}`, `Wolf Song ${tag}`, `The Yak Song ${tag}`]);
    await page.getByLabel("Sort by").selectOption("name-desc");
    await expect(page).toHaveURL(/sort=name-desc/);
    await expect.poll(names).toEqual([`The Yak Song ${tag}`, `Wolf Song ${tag}`, `An Apple Tune ${tag}`]);
    await expect(page.getByRole("status")).toHaveText(/^3 works/);
    await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);

    // The search box narrows the list as the user types, keeps the sort, and writes both to the address.
    await page.getByRole("searchbox").fill(`Wolf Song ${tag}`);
    await expect(page).toHaveURL(new RegExp(`q=Wolf\\+Song\\+${tag}.*sort=name-desc|sort=name-desc.*q=`));
    await expect.poll(names).toEqual([`Wolf Song ${tag}`]);
    await expect(page.getByRole("status")).toHaveText(/^1 work\b/);
    await checkPage(page);

    await page.getByRole("link", { name: `Wolf Song ${tag}` }).click();
    await expect(page.getByRole("heading", { level: 1, name: `Wolf Song ${tag}` })).toBeVisible();
    await checkPage(page);

    for (const path of ["/admin/people", "/admin/bands", "/admin/places"]) {
      await page.goto(path);
      await checkPage(page);
    }
  });

  test("the places list applies its kind choice on change, at phone width", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto("/admin/places");
    const kind = page.getByRole("combobox", { name: "Show", exact: true });
    await kind.selectOption("none");
    await expect(page).toHaveURL(/type=none/);
    await expect(page.getByRole("status")).toContainText("Page 1 of");
    await expect(page.getByRole("button", { name: "Search", exact: true })).toHaveCount(0);
    await checkPage(page);
  });

  test("unknown record IDs return HTTP 404", async ({ page }) => {
    for (const path of ["/admin/works/2000000000", "/admin/people/abc", "/admin/shows/2000000000/edit"]) {
      expect((await page.goto(path))?.status(), path).toBe(404);
    }
  });

  test("finds a show by search, edits its date and a segment, and both show on the Changes page", async ({ page }) => {
    const seeded = await seedShowForReview();
    await page.goto("/admin/shows");
    await page.getByLabel(/Search by date/).fill(seeded.placeName);
    await expect(page).toHaveURL(/q=/);
    await expect(page.getByRole("link", { name: /^Edit show 1980-11-14$/ })).toBeVisible();
    await checkPage(page);
    await page.getByRole("link", { name: /^Edit show 1980-11-14$/ }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^Edit Show 1980-11-14, ${seeded.placeName}`) })).toBeVisible();
    await checkPage(page);

    // The date: clear the day. The date stays a partial date, never day 1.
    await page.getByLabel("Day", { exact: true }).fill("");
    await page.getByRole("button", { name: "Save the show" }).click();
    await expect(page.getByRole("heading", { level: 1, name: new RegExp(`^Edit Show 1980-11, ${seeded.placeName}`) })).toBeVisible();
    await expect
      .poll(async () => (await query(`SELECT 1 FROM shows WHERE id = $1 AND "dateDay" IS NULL AND "dateMonth" = 11`, [seeded.showId])).length)
      .toBe(1);

    // One segment: its summary and its extent (the aborted mark).
    await page.getByRole("button", { name: "Edit segment 1", exact: true }).click();
    const form = page.getByRole("form", { name: "Edit segment 1" });
    const edited = `Edited in the editor ${seeded.placeName}.`;
    await form.getByLabel("Summary").fill(edited);
    // A spoken segment has no extent field: change the delivery first.
    await expect(form.getByLabel("Extent")).toHaveCount(0);
    await form.getByLabel("Delivery").selectOption("SUNG");
    await form.getByLabel("Extent").selectOption("ABORTED");
    await form.getByRole("button", { name: "Save segment 1" }).click();
    await expect(page.getByText(edited, { exact: true })).toBeVisible();
    await expect
      .poll(async () => (await query(`SELECT 1 FROM segments WHERE summary = $1 AND extent = 'ABORTED'`, [edited])).length)
      .toBe(1);

    await page.goto("/admin/changes");
    const change = page.locator("details", { hasText: edited }).first();
    await expect(change).toBeVisible();
    await expect(change.locator("summary")).toContainText("Evidence: own knowledge");
    await change.locator("summary").click();
    await expect(change).toContainText(edited);
    await checkPage(page);
  });

  test("adds a set and a segment, moves it, and refuses a stale save with both versions", async ({ page, context }) => {
    const seeded = await seedShowForReview();
    const url = `/admin/shows/${seeded.showId}/edit`;
    await page.goto(url);
    const stale = await context.newPage();
    await stale.goto(url);

    await page.getByRole("button", { name: "Add the set" }).click();
    await expect(page.getByRole("heading", { level: 3, name: /^Set 2:/ })).toBeVisible();
    const add = page.getByRole("form", { name: "Add a segment to set 2" });
    await add.getByLabel("Delivery").selectOption("SPOKEN");
    await add.getByLabel("Summary").fill("A new spoken segment.");
    await add.getByRole("button", { name: "Add segment to set 2" }).click();
    await expect(page.getByText("A new spoken segment.", { exact: true })).toBeVisible();
    await checkPage(page);

    // The stale tab holds the old show version: a save from it writes nothing.
    await stale.getByLabel("Billed as (what a flyer printed, if it differs)").fill("Stale flyer");
    await page.getByLabel("Billed as (what a flyer printed, if it differs)").fill("Fresh flyer");
    await page.getByRole("button", { name: "Save the show" }).click();
    await expect(page.getByRole("button", { name: "Save the show" })).toBeEnabled();
    await stale.getByRole("button", { name: "Save the show" }).click();
    await expect(stale.getByRole("alert").filter({ hasText: "changed since you opened it" })).toBeVisible();
    expect(await query(`SELECT 1 FROM shows WHERE id = $1 AND "billedAs" = 'Fresh flyer'`, [seeded.showId])).toHaveLength(1);
  });

  test("adds a note and an act to the bill", async ({ page }) => {
    const seeded = await seedShowForReview();
    await page.goto(`/admin/shows/${seeded.showId}/edit`);
    const note = page.getByRole("form", { name: "Add a note" });
    await note.getByLabel("Text of the new note").fill("A curator remark.");
    await note.getByRole("button", { name: "Add the note" }).click();
    await expect(page.getByLabel("Text of note 1")).toHaveValue("A curator remark.");

    const bill = page.getByRole("form", { name: "Add an act" });
    await bill.getByRole("button", { name: "Find act" }).click();
    await bill.getByRole("button", { name: "Search", exact: true }).click();
    await bill.getByRole("button", { name: /^Use Test Band/ }).first().click();
    await bill.getByRole("button", { name: "Add to the bill" }).click();
    await expect(page.getByRole("heading", { level: 3, name: "Add an act" })).toBeVisible();
    await expect.poll(async () => (await query(`SELECT 1 FROM bill_entries WHERE "showId" = $1`, [seeded.showId])).length).toBe(1);
    await checkPage(page);
  });

  test("a keyboard reaches and works the show form and a segment button", async ({ page }) => {
    const seeded = await seedShowForReview();
    await page.goto(`/admin/shows/${seeded.showId}/edit`);
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Year").focus();
    const reached = async (name: RegExp | string, max = 40) => {
      for (let i = 0; i < max; i++) {
        await page.keyboard.press("Tab");
        const found = await page.evaluate((n) => {
          const el = document.activeElement as HTMLElement | null;
          const text = (el?.getAttribute("aria-label") ?? el?.textContent ?? "").trim();
          return new RegExp(n).test(text);
        }, typeof name === "string" ? name : name.source);
        if (found) return;
      }
      throw new Error(`Tab never reached ${name}`);
    };
    // Focus moves on through every field to the save button, which Enter presses.
    await reached("^Save the show$");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "Nothing changed." })).toBeVisible();
    // On to a segment's Edit button: Enter opens its form and the first field takes the keyboard.
    await reached("^Edit segment 1$", 80);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("form", { name: "Edit segment 1" })).toBeVisible();
    await reached("^Save segment 1$", 40);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "Nothing changed." })).toBeVisible();
  });
});
