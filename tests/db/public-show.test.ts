import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient } from "@/generated/prisma/client";
import { getAdjacentPublicShows, getPublicShow, publicShowExists } from "@/lib/data/public/show";
import { getPrisma } from "@/lib/db";
import { jsonLdText, showJsonLd } from "@/lib/json-ld";
import { showSummary } from "@/lib/shows/public-words";
import { buildSetlist, stageTalk } from "@/lib/shows/setlist";
import { resetDatabase } from "../support/reset-database";
import { seedPublicShow, type PublicShowFixture } from "../support/public-show-seed";

const db = getPrisma();

let queries = 0;
const counting = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  log: [{ emit: "event", level: "query" }],
});
counting.$on("query", () => {
  queries += 1;
});

let fixture: PublicShowFixture;

beforeEach(async () => {
  await resetDatabase(db);
  fixture = await seedPublicShow();
});

afterAll(async () => {
  await counting.$disconnect();
});

describe("getPublicShow", () => {
  it("returns the fixture show with its sets, notes, bill and recording", async () => {
    const show = await getPublicShow(fixture.slug, db);
    expect(show).not.toBeNull();
    expect(show?.date).toMatchObject({ dateYear: 1980, dateMonth: 11, dateDay: 14 });
    expect(show?.sets.map((set) => set.label)).toHaveLength(2);
    expect(show?.bill.map((entry) => entry.role)).toEqual(["opener"]);
    expect(show?.notes).toHaveLength(1);
    expect(show?.recordings).toHaveLength(1);
    expect(show?.recordings[0].links[0].url).toBe(`https://example.test/details/test-${fixture.slug.split("-").pop()}`);
  });

  it("leaves nothing private in the result, anywhere", async () => {
    const show = await getPublicShow(fixture.slug, db);
    const text = JSON.stringify(show);
    for (const secret of fixture.secret) expect(text, secret).not.toContain(secret);
    const page = `${jsonLdText(showJsonLd(show!))} ${showSummary(show!)}`;
    for (const secret of fixture.secret) expect(page, secret).not.toContain(secret);
  });

  it("returns null for an unknown slug and for a private show", async () => {
    expect(await getPublicShow("no-such-show", db)).toBeNull();
    await db.entity.update({ where: { id: fixture.showId }, data: { isPublic: false } });
    expect(await getPublicShow(fixture.slug, db)).toBeNull();
    expect(await publicShowExists(fixture.slug, db)).toBe(false);
  });

  it("shows no title for a work that is not public, and keeps the private segment out", async () => {
    const show = await getPublicShow(fixture.slug, db);
    const rows = buildSetlist(show!.sets, "complete").sets[0].rows;
    expect(rows.map((row) => row.title)).toContain("Title not public");
    // Alpha, Tease, Gamma, Delta, the hidden-title row, the suite: the private segment is not a row.
    expect(rows).toHaveLength(6);
  });

  it("keeps the segue chain across a private segment", async () => {
    const show = await getPublicShow(fixture.slug, db);
    const complete = buildSetlist(show!.sets, "complete").sets[0].rows;
    // Alpha runs into a private segment, which runs into the tease: Alpha still runs into it.
    expect(complete[0].joinsNext).toBe(true);
    expect(complete[1].title).toContain("Tease");
    // In the standard view the tease is left out. It does not run into Gamma, so Alpha ends the chain.
    const standard = buildSetlist(show!.sets, "standard").sets[0].rows;
    expect(standard.map((row) => row.title)).not.toContainEqual(expect.stringContaining("Tease"));
    expect(standard[0].joinsNext).toBe(false);
  });

  it("builds the complete view with fragment, portion and footnotes, and the standard view without them", async () => {
    const show = await getPublicShow(fixture.slug, db);
    const complete = buildSetlist(show!.sets, "complete");
    expect(complete.footnotes.map((note) => note.text)).toEqual(
      expect.arrayContaining([expect.stringContaining("last verse only"), expect.stringContaining("Public segment note")]),
    );
    expect(complete.sets[0].rows.find((row) => row.title.startsWith("Tease"))?.marks).toContain("fragment");
    expect(complete.sets[0].rows.find((row) => row.title.startsWith("Gamma"))?.marks).toContain("partial");
    const standard = buildSetlist(show!.sets, "standard");
    expect(standard.footnotes).toEqual([]);
    expect(standard.sets[0].rows.find((row) => row.title.startsWith("Gamma"))?.marks).toEqual(["partial"]);
  });

  it("lists the public summary of each talk segment and no private one", async () => {
    const show = await getPublicShow(fixture.slug, db);
    expect(stageTalk(show!.sets).map((entry) => entry.summary)).toEqual([expect.stringContaining("A talk about the weather")]);
  });

  it("puts the children of a suite under it and drops a private child", async () => {
    const show = await getPublicShow(fixture.slug, db);
    const suite = buildSetlist(show!.sets, "complete").sets[0].rows.find((row) => row.title.startsWith("Beta"));
    expect(suite?.children.map((child) => child.title)).toEqual([expect.stringContaining("Delta")]);
  });

  it("runs a fixed number of queries, whatever the show holds", async () => {
    queries = 0;
    await getPublicShow(fixture.slug, counting);
    expect(queries).toBeLessThanOrEqual(7);
  });
});

describe("getAdjacentPublicShows", () => {
  async function addShow(slug: string, year: number, month: number | null, day: number | null, isPublic = true) {
    const { id } = await db.entity.create({ data: { kind: "SHOW", isPublic } });
    await db.show.create({ data: { id, slug, dateYear: year, dateMonth: month, dateDay: day } });
    return id;
  }

  it("finds the neighbours in date order, skips private shows, and puts a year-only date first", async () => {
    await addShow("a-1979", 1979, null, null);
    await addShow("b-1980-year", 1980, null, null);
    await addShow("c-private", 1980, 11, 15, false);
    await addShow("d-1980-12", 1980, 12, 1);
    const { prev, next } = await getAdjacentPublicShows(fixture.showId, db);
    expect(prev?.slug).toBe("b-1980-year");
    expect(next?.slug).toBe("d-1980-12");
    const first = await getAdjacentPublicShows((await db.show.findFirstOrThrow({ where: { slug: "a-1979" } })).id, db);
    expect(first.prev).toBeNull();
    expect(first.next?.slug).toBe("b-1980-year");
  });
});
