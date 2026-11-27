import AxeBuilder from "@axe-core/playwright";
import { randomBytes } from "node:crypto";
import { expect, test } from "../support/e2e";
import { query, seedSignedInUser } from "../support/auth-fixtures";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function entity(kind: string): Promise<number> {
  return (await query<{ id: number }>(`INSERT INTO entities (kind) VALUES ($1::"EntityKind") RETURNING id`, [kind]))[0].id;
}

async function place(name: string, parentId: number | null): Promise<number> {
  const id = await entity("PLACE");
  await query(`INSERT INTO places (id, "parentId", "updatedAt") VALUES ($1, $2, now())`, [id, parentId]);
  const nameId = await entity("PLACE_NAME");
  await query(`INSERT INTO place_names (id, "placeId", name, position, "updatedAt") VALUES ($1, $2, $3, 1, now())`, [nameId, id, name]);
  return id;
}

/** A city, a venue inside it, a band and a show at the venue. Synthetic names with a random tag. */
async function seedLinkedShow() {
  const tag = randomBytes(4).toString("hex");
  const city = await place(`Linkville ${tag}`, null);
  const venue = await place(`Link Hall ${tag}`, city);
  const bandId = await entity("BAND");
  await query(`INSERT INTO bands (id, name, "updatedAt") VALUES ($1, $2, now())`, [bandId, `Link Band ${tag}`]);
  const showId = await entity("SHOW");
  await query(
    `INSERT INTO shows (id, "dateYear", "dateMonth", "dateDay", "placeId", "bandId", "updatedAt") VALUES ($1, 1981, 3, 7, $2, $3, now())`,
    [showId, venue, bandId],
  );
  return { tag, city, venue, bandId, showId, cityName: `Linkville ${tag}`, venueName: `Link Hall ${tag}`, bandName: `Link Band ${tag}` };
}

test("a venue's count opens the filtered shows list, and Inside opens the city", async ({ page, context, baseURL }) => {
  const admin = await seedSignedInUser("ADMIN");
  await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  const seeded = await seedLinkedShow();

  await page.goto(`/admin/places/${seeded.venue}`);
  await expect(page.getByRole("heading", { level: 1, name: seeded.venueName })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // The count links to the shows list, filtered by this place.
  await page.getByRole("link", { name: /^1 show.*here and inside/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/shows\\?place=${seeded.venue}$`));
  await expect(page.getByText("1 show. Page 1 of 1.")).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(`1981-03-07, ${seeded.venueName}`) })).toBeVisible();
  // The note names the place and links to it. The band of the row links to the band.
  await expect(page.getByRole("main").getByRole("link", { name: seeded.venueName, exact: true })).toHaveAttribute("href", `/admin/places/${seeded.venue}`);
  await expect(page.getByRole("link", { name: `Band ${seeded.bandName}` })).toHaveAttribute("href", `/admin/bands/${seeded.bandId}`);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);

  // Back on the venue page, "Inside" links to the city. The city's count rolls up the venue.
  await page.goto(`/admin/places/${seeded.venue}`);
  await page.getByRole("link", { name: seeded.cityName }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/places/${seeded.city}$`));
  await page.getByRole("link", { name: /^1 show.*here and inside/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/shows\\?place=${seeded.city}$`));
  await expect(page.getByText("1 show. Page 1 of 1.")).toBeVisible();

  // "Attached here" on the city counts none, and its list is empty.
  await page.goto(`/admin/places/${seeded.city}`);
  await page.getByRole("link", { name: /^0 shows.*attached here/ }).click();
  await expect(page.getByText("No shows match.")).toBeVisible();
});

test("a band's count and the show review page link to the records they name", async ({ page, context, baseURL }) => {
  const admin = await seedSignedInUser("ADMIN");
  await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  const seeded = await seedLinkedShow();

  await page.goto(`/admin/bands/${seeded.bandId}`);
  await page.getByRole("link", { name: /^1 show.*of this band/ }).click();
  await expect(page).toHaveURL(new RegExp(`/admin/shows\\?band=${seeded.bandId}$`));
  await expect(page.getByText("1 show. Page 1 of 1.")).toBeVisible();

  await page.goto(`/admin/shows/${seeded.showId}`);
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: seeded.venueName })).toHaveAttribute("href", `/admin/places/${seeded.venue}`);
  await expect(main.getByRole("link", { name: seeded.bandName })).toHaveAttribute("href", `/admin/bands/${seeded.bandId}`);
  expect((await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations).toEqual([]);
});

test("typing a search on a filtered shows list keeps the filter (HSA-184 with HSA-186)", async ({ page, context, baseURL }) => {
  const admin = await seedSignedInUser("ADMIN");
  await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
  const seeded = await seedLinkedShow();

  await page.goto(`/admin/shows?place=${seeded.city}`);
  await expect(page.getByRole("status")).toHaveText("1 show. Page 1 of 1.");
  const search = page.getByRole("searchbox");
  // A search that matches the venue keeps the place filter in the address and in the result.
  await search.fill(`Link Hall ${seeded.tag}`);
  await expect(page).toHaveURL(new RegExp(`place=${seeded.city}.*q=`));
  await expect(page.getByRole("status")).toHaveText("1 show. Page 1 of 1.");
  // A search with no match inside the place gives none, and the filter is still set.
  await search.fill(`nothing ${seeded.tag}`);
  await expect(page.getByText("No shows match.")).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`place=${seeded.city}`));
  // A sort change keeps it too.
  await page.getByLabel("Sort by").selectOption({ index: 1 });
  await expect(page).toHaveURL(new RegExp(`place=${seeded.city}.*sort=`));
});
