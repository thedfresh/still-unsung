import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import { listShows } from "@/lib/data/shows/list";
import { runImport } from "../../scripts/import-legacy/index";
import { buildLegacyFixture, dropLegacyFixture, LEGACY_SCHEMA } from "../support/legacy-fixture";

// Runs the whole legacy import against a small invented copy of the old database (a schema of
// the test database) and checks each mapping rule on the result. No production data.
const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
let outputDir = "";
let unaccounted = -1;

const settings = {
  zotero: { legacySetlistList: "TESTKEY1", gdsets: "TESTKEY2", whitegum: "TESTKEY3" },
  curatorEmail: "curator@example.test",
  agentEmail: "agent@example.test",
};

beforeAll(async () => {
  await client.connect();
  await buildLegacyFixture(client);
  outputDir = await mkdtemp(path.join(tmpdir(), "import-legacy-"));
  const result = await runImport({ legacyPool: pool, legacySchema: LEGACY_SCHEMA, db: prisma, settings, outputDir });
  unaccounted = result.unaccounted;
}, 60_000);

afterAll(async () => {
  await dropLegacyFixture(client);
  await client.end();
  await pool.end();
  await prisma.$disconnect();
  await rm(outputDir, { recursive: true, force: true });
});

const byLegacy = <T extends { legacyId: string | null }>(rows: T[], id: string): T => {
  const row = rows.find((r) => r.legacyId === id);
  if (!row) throw new Error(`No row with legacyId ${id}`);
  return row;
};

describe("legacy import: accounting", () => {
  it("accounts for every old row", () => {
    expect(unaccounted).toBe(0);
  });

  it("leaves the highlight subject kind in place, after the other kinds (item 110)", async () => {
    const kinds = await prisma.subjectKind.findMany({ orderBy: { position: "asc" } });
    const highlight = kinds.find((kind) => kind.name === "highlight");
    expect(highlight?.description).toBeTruthy();
    expect(kinds[kinds.length - 1]).toBe(highlight);
    expect(new Set(kinds.map((kind) => kind.position)).size).toBe(kinds.length);
  });

  it("writes a report with no emails, banter text or raw entries", async () => {
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Stress tests");
    for (const secret of ["contrib@example.test", "Banter text one", "setlist text of the entry", "Private show note"]) {
      expect(report).not.toContain(secret);
    }
    const json = await readFile(path.join(outputDir, "report.json"), "utf8");
    expect(json).not.toContain("contrib@example.test");
  });

  it("writes the 21 proposal files and marks them as not applied", async () => {
    const dir = path.join(outputDir, "proposals");
    const names = (await import("node:fs/promises").then((fs) => fs.readdir(dir))).sort();
    expect(names).toHaveLength(21);
    const bill = JSON.parse(await readFile(path.join(dir, "01-bill.json"), "utf8"));
    expect(bill.applied).toBe(false);
    expect(bill.rows.length).toBeGreaterThan(0);
  });

  it("gives every row of every list a label, a context and a summary at the top", async () => {
    const dir = path.join(outputDir, "proposals");
    for (const file of await readdir(dir)) {
      const json = JSON.parse(await readFile(path.join(dir, file), "utf8"));
      expect(json.summary.rows).toBe(json.rows.length);
      expect(json.summary.list).not.toBe("");
      expect(json.summary.decision).not.toBe("");
      for (const row of json.rows) {
        expect(typeof row.label, file).toBe("string");
        expect(row.label.trim(), file).not.toBe("");
        expect(typeof row.context, file).toBe("object");
      }
    }
  });

  it("shows the show date, song title and note text on a row of the a cappella list", async () => {
    const json = JSON.parse(await readFile(path.join(outputDir, "proposals", "13-a-cappella.json"), "utf8"));
    const row = json.rows.find((r: { legacyId: string }) => r.legacyId === "performances:2");
    expect(row.proposal).toBe("check this note");
    expect(row.matchedText).toContain("a cappella");
    expect(row.context.text).toBe("Sung a cappella.");
    expect(row.context.showDate).toMatch(/^\d{4}/);
    expect(row.context.songTitle).toBeTruthy();
    expect(row.label).toContain(row.context.songTitle);
    expect(row.label).toContain(row.context.showDate);
    expect(row.segmentId).toBeGreaterThan(0);
  });
});

describe("legacy import: shows", () => {
  it("leaves out the 2099 test show and everything under it, and counts every row under it as dropped", async () => {
    expect(await prisma.show.count()).toBe(16);
    expect(await prisma.show.findFirst({ where: { dateYear: 2099 } })).toBeNull();
    expect(await prisma.recording.count()).toBe(0);
    const json = JSON.parse(await readFile(path.join(outputDir, "report.json"), "utf8"));
    for (const table of ["event_musicians", "set_musicians", "performance_musicians", "show_banter"]) {
      expect(Object.keys(json.ledger[table].dropped)).toContain("test-show-2099-12-20");
    }
  });

  it("orders an early and a late show on one date and keeps the date as written only when it differs", async () => {
    const shows = await prisma.show.findMany();
    expect(byLegacy(shows, "events:1")).toMatchObject({ timeLabel: "Early", orderOnDate: 1, dateAsWritten: null });
    expect(byLegacy(shows, "events:2")).toMatchObject({ timeLabel: "Late", orderOnDate: 2 });
    const lone = byLegacy(shows, "events:3");
    expect(lone).toMatchObject({ timeLabel: "Early", orderOnDate: null, dateAsWritten: "June 1st, 1975?" });
  });

  it("invents no order and no time: unlabelled shows on one date and a time with no am or pm", async () => {
    const shows = await prisma.show.findMany();
    expect(byLegacy(shows, "events:10")).toMatchObject({ orderOnDate: null });
    expect(byLegacy(shows, "events:11")).toMatchObject({ orderOnDate: null });
    const unclear = byLegacy(shows, "events:12");
    expect(unclear).toMatchObject({ timeLabel: "8:00", orderOnDate: null });
    const [{ time }] = await prisma.$queryRaw<Array<{ time: string | null }>>`SELECT "scheduledTime"::text AS time FROM shows WHERE id = ${unclear.id}`;
    expect(time).toBeNull();
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Dates with several shows and no order");
    expect(report).toContain("Show times that cannot be read");
  });

  it("carries the old creation date to the record and its entity row", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:1");
    const entity = await prisma.entity.findUniqueOrThrow({ where: { id: show.id } });
    expect(show.createdAt.toISOString()).toBe("2001-02-03T04:05:06.000Z");
    expect(entity.createdAt.toISOString()).toBe("2001-02-03T04:05:06.000Z");
    const work = byLegacy(await prisma.work.findMany(), "songs:1");
    expect(work.createdAt.toISOString()).toBe("2002-03-04T05:06:07.000Z");
    const person = byLegacy(await prisma.person.findMany(), "musicians:2");
    expect(person.createdAt.toISOString()).toBe("2003-04-05T06:07:08.000Z");
    const segment = byLegacy(await prisma.segment.findMany(), "performances:1");
    expect(segment.createdAt.toISOString()).toBe("2004-05-06T07:08:09.000Z");
    const venue = byLegacy(await prisma.place.findMany(), "venues:1");
    expect(venue.createdAt.toISOString()).toBe("2005-06-07T08:09:10.000Z");
  });

  it("makes a festival context a show group of kind festival, not a parent place", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:8");
    const members = await prisma.showGroupMember.findMany({ where: { showId: show.id }, include: { showGroup: { include: { showGroupKind: true } } } });
    expect(members).toHaveLength(1);
    expect(members[0].showGroup).toMatchObject({ name: "Summer Test Festival" });
    expect(members[0].showGroup.showGroupKind.name).toBe("festival");
    const place = await prisma.place.findUniqueOrThrow({ where: { id: show.placeId as number }, include: { parent: { include: { names: true } } } });
    expect(place.parent?.names[0].name).toBe("Testville");
  });

  it("makes the Songwriters Hall of Fame and Fete des Leus festivals (items 21, 121)", async () => {
    const groups = await prisma.showGroup.findMany({ include: { showGroupKind: true } });
    for (const name of ["Songwriters Hall of Fame", "Fete des Leus", "Summer Test Festival"]) {
      expect(groups.find((g) => g.name === name)?.showGroupKind.name, name).toBe("festival");
    }
  });

  it("maps the uncertain flags to certainty, and the 1975 rule to the date", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:3");
    expect(show).toMatchObject({
      statusCertainty: "POSSIBLE",
      placeCertainty: "POSSIBLE",
      hunterParticipationCertainty: "POSSIBLE",
      dateCertainty: "POSSIBLE",
    });
  });

  it("makes an errata show spurious and gives it no type", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:4");
    expect(show).toMatchObject({ status: "SPURIOUS", showTypeId: null });
  });

  it("moves a contributor line out of the public note and into the show archive (items 119, 120)", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:1");
    const notes = await prisma.note.findMany({ where: { attachments: { some: { entityId: show.id } } } });
    const text = notes.map((n) => n.body).join("\n");
    expect(text).toContain("Taped by a fan.");
    expect(text).not.toContain("Contributor: Test Contributor");
    // The old private notes of the show are archived, never a note.
    expect(notes.some((n) => n.legacyId === "events:1:privateNotes")).toBe(false);
    expect(text).not.toContain("Old private note of the show");
  });

  it("fills legacyData with each of its parts, and not the verified flag (item 120)", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:1");
    expect(show.legacyData).toEqual({
      contributors: [{ name: "Test Contributor", privateNotes: "Contributor row remark" }],
      contributorLinesInPublicNotes: ["Test Contributor"],
      rawData: "Contributor: Test Contributor\nsetlist text of the entry",
      rawDataGdsets: "gdsets entry text",
      privateNotes: "Old private note of the show",
      billing: "Test Band with Test Opener",
      etreeShowId: "12345",
    });
    const second = byLegacy(await prisma.show.findMany(), "events:2");
    expect(second.legacyData).toEqual({ contributors: [{ name: "Test Contributor", description: "Provided the tape" }] });
    expect(byLegacy(await prisma.show.findMany(), "events:10").legacyData).toBeNull();
    // A raw entry that holds JSON is stored as parsed JSON, not as a string.
    const json = byLegacy(await prisma.show.findMany(), "events:3");
    expect(json.legacyData).toEqual({ rawData: { setlist: ["Alpha Song", "Beta Song"] } });
  });

  it("makes no citation and no contributor person (items 119, 120)", async () => {
    expect(await prisma.citation.count()).toBe(0);
    const people = await prisma.person.findMany();
    expect(people.filter((p) => p.legacyId?.startsWith("contributors:"))).toHaveLength(0);
    expect(people.find((p) => p.name === "Test Contributor")).toBeUndefined();
    expect(people.some((p) => p.email !== null)).toBe(false);
  });

  it("keeps only a true billed name in billedAs; the other text goes to the bill list (item 15)", async () => {
    const shows = await prisma.show.findMany();
    expect(byLegacy(shows, "events:1").billedAs).toBe("Test Band with Test Opener");
    const opened = byLegacy(shows, "events:13");
    expect(opened.billedAs).toBeNull();
    expect(opened.legacyData).toMatchObject({ billing: "Opened for Test Act" });
    const bill = JSON.parse(await readFile(path.join(outputDir, "proposals", "01-bill.json"), "utf8"));
    expect(bill.rows.some((r: { legacyId: string; text?: string }) => r.legacyId === "events:13" && r.text === "Opened for Test Act")).toBe(true);
    // The words may sit in the middle of the text.
    const middle = byLegacy(shows, "events:14");
    expect(middle.billedAs).toBeNull();
    expect(middle.legacyData).toMatchObject({ billing: "Comfort opened for the Jerry Garcia Band" });
    expect(bill.rows.some((r: { legacyId: string; text?: string }) => r.legacyId === "events:14" && r.text === "Comfort opened for the Jerry Garcia Band")).toBe(true);
  });

  it("clears the month of a season date and moves a time of day to the time label (item 22)", async () => {
    const shows = await prisma.show.findMany();
    expect(byLegacy(shows, "events:13")).toMatchObject({ dateYear: 1976, dateMonth: null, dateDay: null, dateAsWritten: "Summer 1976" });
    expect(byLegacy(shows, "events:14")).toMatchObject({ timeLabel: "Afternoon", dateAsWritten: null, dateMonth: 6, dateDay: 5 });
  });

  it("gives the sets of a Poetry Reading show the Reading set type (item 16)", async () => {
    const sets = await prisma.set.findMany({ include: { setType: true } });
    expect(byLegacy(sets, "sets:8").setType.name).toBe("Reading");
  });

  it("places a show at an unknown venue at its town, with no venue place (item 121)", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:15");
    expect(show.placeNameId).toBeNull();
    const place = await prisma.place.findUniqueOrThrow({ where: { id: show.placeId as number }, include: { names: true } });
    expect(place.names[0].name).toBe("Testville");
    expect(await prisma.placeName.count({ where: { name: { startsWith: "Unknown" } } })).toBe(0);
    // "Unknown Studio" is treated the same way.
    const studio = byLegacy(await prisma.show.findMany(), "events:17");
    expect(studio.placeNameId).toBeNull();
    expect(studio.placeId).toBe(show.placeId);
  });

  it("is not public in any public read of a show (item 120)", async () => {
    const list = JSON.stringify(await listShows("", 1, prisma));
    expect(list).not.toContain("legacyData");
    expect(list).not.toContain("setlist text of the entry");
  });

  it("keeps a private show private all the way down", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:7");
    const set = await prisma.set.findFirstOrThrow({ where: { showId: show.id }, include: { entity: true } });
    const segment = await prisma.segment.findFirstOrThrow({ where: { setId: set.id }, include: { entity: true } });
    expect((await prisma.entity.findUniqueOrThrow({ where: { id: show.id } })).isPublic).toBe(false);
    expect(set.entity.isPublic).toBe(false);
    expect(segment.entity.isPublic).toBe(false);
  });

  it("maps interview shows to an interview work and a spoken segment", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:6");
    const segment = await prisma.segment.findFirstOrThrow({ where: { set: { showId: show.id }, legacyId: "events:6:interview" }, include: { work: { include: { workKind: true } } } });
    expect(segment.delivery).toBe("SPOKEN");
    expect(segment.work?.workKind.name).toBe("interview");
  });

  it("puts an interview in the show's existing set, and gives its work the show's private setting", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:6");
    expect(await prisma.set.count({ where: { showId: show.id } })).toBe(1);
    const segments = await prisma.segment.findMany({ where: { set: { showId: show.id } }, orderBy: { sortKey: "asc" } });
    expect(segments.map((s) => s.legacyId)).toEqual(["performances:10", "events:6:interview"]);
    const privateShow = byLegacy(await prisma.show.findMany(), "events:9");
    const privateSegment = await prisma.segment.findFirstOrThrow({ where: { set: { showId: privateShow.id } } });
    const work = await prisma.entity.findUniqueOrThrow({ where: { id: privateSegment.workId as number } });
    expect(work.isPublic).toBe(false);
  });

  it("maps set types, with a partial set proposed for review", async () => {
    const sets = await prisma.set.findMany({ include: { setType: true } });
    expect(byLegacy(sets, "sets:1").setType.name).toBe("Set");
    expect(byLegacy(sets, "sets:2").setType.name).toBe("Encore");
    expect(byLegacy(sets, "sets:3").setType.name).toBe("Set");
    expect(byLegacy(sets, "sets:3").incompleteReasonId).toBeNull();
    expect(byLegacy(sets, "sets:6").setType.name).toBe("Weird Type");
    expect(byLegacy(sets, "sets:6").setType.includeInStats).toBe(false);
    const proposal = JSON.parse(await readFile(path.join(outputDir, "proposals", "10-incomplete-setlists.json"), "utf8"));
    expect(proposal.rows).toHaveLength(1);
  });
});

describe("legacy import: segments", () => {
  it("writes performances and banter in order with sort keys", async () => {
    const set = byLegacy(await prisma.set.findMany(), "sets:1");
    const segments = await prisma.segment.findMany({ where: { setId: set.id }, orderBy: { sortKey: "asc" } });
    expect(segments.map((s) => s.legacyId)).toEqual([
      "show_banter:1",
      "performances:1",
      "show_banter:2",
      "performances:2",
      "performances:3",
    ]);
    expect(segments.map((s) => s.sortKey)).toEqual(["a0", "a1", "a2", "a3", "a4"]);
    expect(segments[0]).toMatchObject({ delivery: "SPOKEN", workId: null, wordsAsHeard: "Banter text one" });
  });

  it("makes banter public with Hunter as the speaker (items 111, 114)", async () => {
    const hunter = await prisma.person.findUniqueOrThrow({ where: { key: "robert-hunter" } });
    const banter = (await prisma.segment.findMany()).filter((s) => s.legacyId?.startsWith("show_banter:"));
    expect(banter.length).toBeGreaterThan(0);
    for (const segment of banter) expect(segment).toMatchObject({ wordsPublic: true, deliveredById: hunter.id });
  });

  it("makes no work for an unknown song or instrumental, and keeps the segment (item 121)", async () => {
    expect(await prisma.work.count({ where: { title: { startsWith: "Unknown" } } })).toBe(0);
    const all = await prisma.segment.findMany();
    expect(byLegacy(all, "performances:11")).toMatchObject({ workId: null });
    expect(byLegacy(all, "performances:12")).toMatchObject({ workId: null, delivery: "PLAYED" });
  });

  it("makes a vocal entry with no person for an unknown musician who sang (item 121)", async () => {
    const segment = byLegacy(await prisma.segment.findMany(), "performances:5");
    const entries = await prisma.vocalEntry.findMany({ where: { segmentId: segment.id } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ personId: null, legacyId: "performance_musicians:4" });
    expect(await prisma.lineupEntry.count({ where: { legacyId: "performance_musicians:4" } })).toBe(0);
  });

  it("feeds the new note lists: quotes and teases, reported, Hunter does not play, from an album", async () => {
    const rowsOf = async (file: string): Promise<string[]> =>
      (JSON.parse(await readFile(path.join(outputDir, "proposals", file), "utf8")).rows as Array<{ legacyId: string }>).map((r) => r.legacyId);
    expect(await rowsOf("18-quotes-and-teases.json")).toContain("performances:6");
    expect(await rowsOf("19-reported-not-on-tape.json")).toContain("performances:6");
    expect(await rowsOf("20-hunter-does-not-play.json")).toContain("performances:8");
    expect(await rowsOf("21-from-an-album.json")).toContain("performances:8");
    // The text of a song note feeds the lists too.
    expect(await rowsOf("21-from-an-album.json")).toContain("songs:9");
  });

  it("maps the performance flags", async () => {
    const all = await prisma.segment.findMany();
    expect(byLegacy(all, "performances:1")).toMatchObject({ joinsNext: "RUNS_INTO", extent: "PARTIAL" });
    expect(byLegacy(all, "performances:2")).toMatchObject({ extent: "FRAGMENT", workCertainty: "POSSIBLE" });
    expect(byLegacy(all, "performances:3")).toMatchObject({ delivery: "PLAYED", cutAtStart: true, hasGaps: true });
    expect(byLegacy(all, "performances:4").extent).toBe("ABORTED");
  });

  it("keeps an uncertain song as a work and leaves its other segments' certainty alone (item 105)", async () => {
    const all = await prisma.segment.findMany();
    // Song 2 is flagged uncertain; performance 9 of it carries no flag of its own.
    expect(byLegacy(all, "performances:9")).toMatchObject({ workCertainty: "CONFIRMED" });
    expect(byLegacy(all, "performances:9").workId).not.toBeNull();
    const list02 = JSON.parse(await readFile(path.join(outputDir, "proposals", "02-uncertain-songs.json"), "utf8"));
    expect(list02.rows).toHaveLength(1);
    const list15 = JSON.parse(await readFile(path.join(outputDir, "proposals", "15-old-uncertain-flags.json"), "utf8"));
    expect(list15.rows.some((r: { legacyId: string }) => r.legacyId === "performances:9")).toBe(false);
    expect(list15.rows.some((r: { legacyId: string }) => r.legacyId === "performances:2")).toBe(true);
  });

  it("writes lead and other singers, and an unknown singer as no person", async () => {
    const segment = byLegacy(await prisma.segment.findMany(), "performances:1");
    const entries = await prisma.vocalEntry.findMany({ where: { segmentId: segment.id } });
    expect(entries.map((e) => e.role).sort()).toEqual(["BACKING", "HARMONY", "LEAD"]);
    expect(entries.find((e) => e.role === "HARMONY")?.personId).toBeNull();
  });

  it("does not turn unknown vocal role text into a lead; it lists the row", async () => {
    const segment = byLegacy(await prisma.segment.findMany(), "performances:2");
    expect(await prisma.vocalEntry.count({ where: { segmentId: segment.id } })).toBe(0);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("performance_vocalists:3");
    expect(report).toContain("song_vocalists:3");
  });

  it("drops a lineup row that repeats the band, keeps an exception, and marks the others absent for solo Hunter", async () => {
    const entries = await prisma.lineupEntry.findMany();
    expect(entries.filter((e) => e.legacyId === "event_musicians:1")).toHaveLength(0);
    expect(entries.filter((e) => e.legacyId === "event_musicians:2")).toHaveLength(1);
    // A row that differs in vocals, or carries notes, is not a repeat: it is kept (item 84).
    expect(entries.filter((e) => e.legacyId === "event_musicians:3")).toHaveLength(1);
    expect(entries.find((e) => e.legacyId === "event_musicians:3")?.sings).toBe(true);
    expect(entries.filter((e) => e.legacyId === "event_musicians:4")).toHaveLength(1);
    const kept4 = byLegacy(entries, "event_musicians:4");
    const notes = await prisma.note.findMany({ where: { attachments: { some: { entityId: kept4.id } } } });
    expect(notes.map((n) => n.body)).toEqual(["Lineup row remark"]);
    expect(entries.filter((e) => e.legacyId === "performance_musicians:1")).toHaveLength(0);
    const kept = byLegacy(entries, "performance_musicians:2");
    expect(await prisma.lineupInstrument.count({ where: { lineupEntryId: kept.id } })).toBe(1);
    const solo = entries.filter((e) => e.legacyId === "performances:3:isSoloHunter");
    expect(solo.length).toBeGreaterThan(0);
    expect(solo.every((e) => e.absent)).toBe(true);
  });
});

describe("legacy import: works, people and places", () => {
  it("splits credits into people and keeps unsplittable text as a note", async () => {
    const work = byLegacy(await prisma.work.findMany(), "songs:1");
    const credits = await prisma.credit.findMany({ where: { workId: work.id }, include: { role: true, person: true } });
    expect(credits.map((c) => `${c.role.name}:${c.person.name}`).sort()).toEqual([
      "music:Test Author",
      "words:Second Author",
      "words:Test Author",
    ]);
    expect(credits.every((c) => c.kind === "ATTRIBUTED" && c.certainty === "CONFIRMED")).toBe(true);
    const beta = byLegacy(await prisma.work.findMany(), "songs:2");
    expect(await prisma.credit.count({ where: { workId: beta.id } })).toBe(0);
    // Only "Grateful Dead" is left for review: "Traditional" is a marker, not text to split.
    const split = JSON.parse(await readFile(path.join(outputDir, "proposals", "08-credit-splits.json"), "utf8"));
    expect(split.rows).toHaveLength(1);
    expect(split.rows[0].legacyId).toBe("songs:8");
  });

  const creditsOf = async (legacyId: string) => {
    const work = byLegacy(await prisma.work.findMany(), legacyId);
    const credits = await prisma.credit.findMany({ where: { workId: work.id }, include: { role: true, person: true } });
    return { work, lines: credits.map((c) => `${c.role.name}:${c.person.name}`).sort() };
  };

  it("marks a traditional song and gives it no credit (item 121)", async () => {
    for (const id of ["songs:2", "songs:5"]) {
      const { work, lines } = await creditsOf(id);
      expect(work.traditional, id).toBe(true);
      expect(lines, id).toEqual([]);
    }
    expect((await creditsOf("songs:1")).work.traditional).toBe(false);
  });

  it("gives \"Traditional, arr. X\" the marker and an arrangement credit for the existing person (item 121)", async () => {
    const { work, lines } = await creditsOf("songs:6");
    expect(work.traditional).toBe(true);
    expect(lines).toEqual(["arrangement:Jerry Garcia"]);
    const garcia = await prisma.person.findFirstOrThrow({ where: { name: "Jerry Garcia" } });
    const credit = await prisma.credit.findFirstOrThrow({ where: { workId: work.id } });
    expect(credit.personId).toBe(garcia.id);
  });

  it("also credits the second name of \"Traditional/Arthur Smith, arr. Garcia\" (item 121)", async () => {
    const { work, lines } = await creditsOf("songs:7");
    expect(work.traditional).toBe(true);
    expect(lines).toEqual(["arrangement:Jerry Garcia", "music:Arthur Smith", "words:Arthur Smith"]);
  });

  it("reads the typo \"Tradititional\" as Traditional, and \"Traditional (Hunter)\" as an arrangement credit", async () => {
    const typo = await creditsOf("songs:12");
    expect(typo.work.traditional).toBe(true);
    expect(typo.lines).toEqual([]);
    expect(await prisma.person.count({ where: { name: { startsWith: "Tradit" } } })).toBe(0);
    const bracket = await creditsOf("songs:13");
    expect(bracket.work.traditional).toBe(true);
    expect(bracket.lines).toEqual(["arrangement:Robert Hunter"]);
  });

  it("resolves \"arr. Sebastian\" to John Sebastian, not to a surname-only person", async () => {
    const { work, lines } = await creditsOf("songs:14");
    expect(work.traditional).toBe(true);
    expect(lines).toEqual(["arrangement:John Sebastian"]);
    expect(await prisma.person.count({ where: { name: "Sebastian" } })).toBe(0);
  });

  it("never guesses between several people with a surname: keeps it as written and lists the merge (HSA-173); lists a name with no match", async () => {
    // "Dave Freiberg" is another spelling of David Freiberg (name-fixes.ts): one person.
    expect((await creditsOf("songs:17")).lines).toEqual(["words:David Freiberg"]);
    expect(await prisma.person.count({ where: { name: "Dave Freiberg" } })).toBe(0);
    // David and Cass Freiberg both match "Freiberg". The import does not choose; name-fixes.ts does.
    expect((await creditsOf("songs:18")).lines).toEqual(["words:Freiberg"]);
    expect(await prisma.person.count({ where: { name: "Freiberg" } })).toBe(1);
    const merges = JSON.parse(await readFile(path.join(outputDir, "proposals", "06-person-merges.json"), "utf8")).rows as Array<{ name: string; reason: string }>;
    expect(merges.some((r) => r.name === "Freiberg" && r.reason.includes("several"))).toBe(true);
    expect(merges.some((r) => r.name === "Pigpen" && r.reason.includes("no full-name person"))).toBe(true);
  });

  it("makes no credit for a name on the review list, and lists it (item 121)", async () => {
    const { work, lines } = await creditsOf("songs:8");
    expect(work.traditional).toBe(false);
    expect(lines).toEqual([]);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain('songs:8 song_by: "Grateful Dead"');
  });

  it("makes no credit and no person from the old arrangement text, and lists it as a version label (item 121)", async () => {
    const { lines } = await creditsOf("songs:9");
    expect(lines.every((line) => line.startsWith("words:"))).toBe(true);
    expect(await prisma.credit.count({ where: { legacyId: "songs:9:arrangement" } })).toBe(0);
    expect(await prisma.person.count({ where: { name: { contains: "Lloyd Price" } } })).toBe(0);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Lloyd Price version");
  });

  it("resolves a surname-only credit to the existing full-name person and makes no duplicate (item 20)", async () => {
    const { lines } = await creditsOf("songs:9");
    expect(lines).toEqual(["words:Jerry Garcia", "words:Lesh"]);
    expect(await prisma.person.count({ where: { name: "Garcia" } })).toBe(0);
    expect(await prisma.person.count({ where: { name: { contains: "Garcia" } } })).toBe(1);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Surname-only credit names not resolved");
  });

  it("makes no second Robert Hunter from any path (item 13)", async () => {
    expect(await prisma.person.count({ where: { name: "Robert Hunter" } })).toBe(1);
    expect(await prisma.person.count({ where: { key: { startsWith: "robert-hunter" } } })).toBe(1);
  });

  it("gives a credit to Hunter to the seeded Robert Hunter, and proposes other near-matches", async () => {
    const terrapin = byLegacy(await prisma.work.findMany(), "songs:4");
    const hunter = await prisma.person.findUniqueOrThrow({ where: { key: "robert-hunter" } });
    const credits = await prisma.credit.findMany({ where: { workId: terrapin.id } });
    expect(credits.map((c) => c.personId)).toEqual([hunter.id]);
    expect(await prisma.person.count({ where: { name: "Hunter" } })).toBe(0);
    const gamma = byLegacy(await prisma.work.findMany(), "songs:3");
    const near = await prisma.credit.findFirstOrThrow({ where: { workId: gamma.id }, include: { person: true } });
    expect(near.person.name).toBe("Hunter Smith");
    expect(near.legacyId).toBe("songs:3:musicBy");
    const merges = JSON.parse(await readFile(path.join(outputDir, "proposals", "06-person-merges.json"), "utf8"));
    expect(merges.rows.some((r: { reason?: string }) => r.reason === "near-match of Robert Hunter")).toBe(true);
  });

  it("keeps the original artist as a public note and proposes a best-known version", async () => {
    const work = byLegacy(await prisma.work.findMany(), "songs:1");
    const notes = await prisma.note.findMany({ where: { attachments: { some: { entityId: work.id } } } });
    expect(notes.find((n) => n.body === "Best-known version: Test Group")?.isPublic).toBe(true);
    const backlinks = await prisma.backlink.findMany({ where: { url: "https://example.test/page" } });
    expect(backlinks).toHaveLength(1);
  });

  it("makes suite works with part-of references, and drops derived tags", async () => {
    const suite = await prisma.work.findFirstOrThrow({ where: { title: "Terrapin" } });
    expect(suite.suiteStructure).toBe("VARIABLE");
    const refs = await prisma.reference.findMany({ where: { toId: suite.id }, include: { referenceKind: true } });
    expect(refs).toHaveLength(1);
    expect(refs[0].referenceKind.name).toBe("part of");
    expect(suite.legacyId).toBe("tags:1");
  });

  it("writes default singers with no band, and drops an unknown singer (item 121)", async () => {
    const alpha = byLegacy(await prisma.work.findMany(), "songs:1");
    const beta = byLegacy(await prisma.work.findMany(), "songs:2");
    const singers = await prisma.workSinger.findMany();
    const ofAlpha = singers.filter((s) => s.workId === alpha.id);
    expect(ofAlpha).toHaveLength(1);
    expect(ofAlpha.every((s) => s.personId !== null && s.bandId === null)).toBe(true);
    expect(singers.filter((s) => s.workId === beta.id)).toHaveLength(0);
    expect(singers.some((s) => s.personId === null)).toBe(false);
  });

  it("makes only lead singers default singers, and lists harmony, backing and unknown role rows", async () => {
    const alpha = byLegacy(await prisma.work.findMany(), "songs:1");
    const gamma = byLegacy(await prisma.work.findMany(), "songs:3");
    // Song 1 has a lead (musician 4) from its own field and a harmony row for musician 2.
    expect((await prisma.workSinger.findMany({ where: { workId: alpha.id } })).map((s) => s.legacyId)).toEqual(["songs:1:leadVocals"]);
    expect(await prisma.workSinger.count({ where: { workId: gamma.id } })).toBe(0);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Song vocalists that are not leads");
    expect(report).toContain("song_vocalists:2");
  });

  it("keeps the fixed people and makes no contributor person, so no name repeats (item 120)", async () => {
    const people = await prisma.person.findMany();
    const hunter = people.filter((p) => p.key === "robert-hunter");
    expect(hunter).toHaveLength(1);
    expect(hunter[0].legacyId).toBe("musicians:1");
    expect(people.find((p) => p.name === "Unknown")).toBeUndefined();
    expect(people.filter((p) => p.name === "Test Guitarist")).toHaveLength(1);
    const merges = JSON.parse(await readFile(path.join(outputDir, "proposals", "06-person-merges.json"), "utf8"));
    expect(merges.rows.filter((r: { reason?: string }) => r.reason === undefined)).toHaveLength(0);
    expect(new Set(people.map((p) => p.key)).size).toBe(people.length);
  });

  it("puts the United States above a US state, also when the old venue has no country (item 121)", async () => {
    const hall = await prisma.place.findFirstOrThrow({ where: { legacyId: "venues:6" } });
    const names: string[] = [];
    for (let at: number | null = hall.id; at !== null; ) {
      const place: { parentId: number | null; names: Array<{ name: string }> } = await prisma.place.findUniqueOrThrow({ where: { id: at }, include: { names: true } });
      names.push(place.names[0].name);
      at = place.parentId;
    }
    expect(names).toEqual(["US Hall", "Springfield", "CA", "United States"]);
  });

  it("builds the place chain, with the context as a parent place", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:3");
    const names: string[] = [];
    for (let at: number | null = show.placeId; at !== null; ) {
      const place = await prisma.place.findUniqueOrThrow({ where: { id: at }, include: { names: true } });
      names.push(place.names[0].name);
      at = place.parentId;
    }
    expect(names).toEqual(["Other Hall", "Test Campus", "Testville", "TS", "Testland"]);
    const hall = byLegacy(await prisma.show.findMany(), "events:1");
    expect(hall.placeNameId).not.toBeNull();
  });

  it("makes an address for every old slug", async () => {
    const paths = (await prisma.address.findMany()).map((a) => a.path);
    expect(paths).toEqual(expect.arrayContaining(["/event/e1", "/shows/e1", "/song/alpha-song", "/venue/test-hall", "/band/test-band"]));
  });

  it("makes the two accounts from the settings and the three sources from their keys", async () => {
    expect((await prisma.user.findMany()).map((u) => u.role).sort()).toEqual(["ADMIN", "AGENT"]);
    // The albums are archive-owned sources with no Zotero key.
    expect((await prisma.source.findMany()).map((s) => s.zoteroKey).filter((key) => key !== null).sort()).toEqual(["TESTKEY1", "TESTKEY2", "TESTKEY3"]);
  });
});

describe("legacy import: recordings and links", () => {
  it("makes no recording and no outside ID on a recording or from the etree show ID (item 118)", async () => {
    expect(await prisma.recording.count()).toBe(0);
    const ids = await prisma.externalId.findMany({ include: { linkSystem: true } });
    expect(ids.filter((i) => ["SHN", "Lossless Legs", "EtreeDB"].includes(i.linkSystem.name))).toHaveLength(0);
    expect(ids.some((i) => i.value.startsWith("gd99-01-02"))).toBe(false);
    // The lists stay, and a recording type keeps its old description (item 25).
    expect(await prisma.recordingType.findUniqueOrThrow({ where: { name: "SBD" } })).toMatchObject({ description: "Soundboard recording" });
    expect(await prisma.linkSystem.count({ where: { name: { in: ["SHN", "Lossless Legs", "Live Music Archive", "EtreeDB"] } } })).toBe(4);
  });

  it("writes one candidate row for each old link, in a private file outside the repository (item 118)", async () => {
    const text = await readFile(path.join(outputDir, "candidates-recordings.csv"), "utf8");
    const lines = text.split("\n").filter((line) => line !== "");
    const [header, ...rows] = lines;
    expect(header.split(",")).toEqual(expect.arrayContaining(["showId", "showDate", "oldEventId", "oldRecordingId", "recordingType", "description", "taper", "lengthMinutes", "linkSystem", "value", "url", "linkTitle", "linkDescription"]));
    // Recording 1 has two links of its own (SHN and Live Music Archive) and one link row; the
    // recording of the test show and the recording with no link make no row.
    expect(rows).toHaveLength(4);
    const byValue = (value: string) => rows.find((row) => row.split(",").includes(value)) as string;
    expect(byValue("shn1")).toContain("SHN");
    // An SHN ID gets its address from the EtreeDB template.
    expect(byValue("shn1")).toContain("https://db.etree.org/shn/shn1");
    // A stray tab, a doubled slash and a trailing slash are trimmed from an old value.
    expect(byValue("gd00-01-01.messy")).toContain("https://archive.org/details/gd00-01-01.messy");
    expect(byValue("shn1")).toContain("1999-01-02");
    expect(byValue("shn1")).toContain("Test Taper");
    expect(byValue("gd99-01-02.test")).toContain("https://archive.org/details/gd99-01-02.test");
    expect(byValue("gd99-01-02.test2")).toContain("LMA copy");
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).not.toContain("archive.org");
    expect(report).not.toContain("Test Taper");
  });

  it("routes links by their rule", async () => {
    const ids = await prisma.externalId.findMany({ include: { linkSystem: true } });
    expect(ids.some((i) => i.linkSystem.name === "Wikipedia" && i.legacyId === "links:1")).toBe(true);
    expect(ids.find((i) => i.legacyId === "links:5")?.value).toBe("zyxwvutsrqp");
    // The old column is "isActive": an inactive link stays inactive.
    expect(ids.find((i) => i.legacyId === "links:5")?.isActive).toBe(false);
    expect(ids.find((i) => i.legacyId === "links:1")?.isActive).toBe(true);
    expect(ids.some((i) => i.legacyId === "links:4")).toBe(false);
    expect(ids.some((i) => i.legacyId === "links:3")).toBe(false);
    // A link to a recording is a candidate only: no outside ID.
    expect(ids.some((i) => i.legacyId === "links:7")).toBe(false);
  });

  it("makes Whitegum links outside IDs on the work, with the page name and anchor (item 121)", async () => {
    const system = await prisma.linkSystem.findUniqueOrThrow({ where: { name: "Whitegum" } });
    expect(system).toMatchObject({ purpose: "READ", urlTemplate: "https://www.whitegum.com/songfile/{value}" });
    const ids = await prisma.externalId.findMany({ where: { linkSystemId: system.id } });
    // Link 8 keeps its page from the query; link 9 sits outside /songfile/ and is listed.
    expect(ids.map((i) => `${i.legacyId}:${i.value}`).sort()).toEqual(["links:6:Beta.htm#verse", "links:8:STAGGERL.HTM"]);
    const works = await prisma.work.findMany({ where: { id: { in: ids.map((i) => i.entityId) } } });
    expect(works.map((w) => w.legacyId).sort()).toEqual(["songs:2", "songs:3"]);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Whitegum links outside /songfile/");
    expect(report).toContain("links:9");
  });
});

describe("legacy import: albums and suites (item 121)", () => {
  it("makes the albums archive-owned sources of kind album, and fixes a doubled title", async () => {
    const sources = await prisma.source.findMany({ where: { sourceKind: { name: "album" } }, orderBy: { title: "asc" } });
    expect(sources.map((s) => s.title)).toEqual(["Amagamalin Street", "Doubled Title 50th Bonus Disc", "Rock Columbia", "Test Album"]);
    for (const source of sources) expect(source).toMatchObject({ zoteroKey: null, zoteroData: null, syncedAt: null });
  });

  it("leaves the books out of the album sources and lists them for the book import", async () => {
    expect(await prisma.source.count({ where: { title: "Sentinel" } })).toBe(0);
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Books waiting for the book import");
    expect(report).toContain('"Sentinel"');
    expect(await prisma.sourceWork.count({ where: { work: { legacyId: "songs:1" }, source: { title: "Sentinel" } } })).toBe(0);
  });

  it("links the songs on an album as source-works, with the track as the place", async () => {
    const links = await prisma.sourceWork.findMany({ where: { source: { title: "Rock Columbia" } }, include: { work: true }, orderBy: { position: "asc" } });
    expect(links.map((l) => `${l.work.legacyId}:${l.place}`)).toEqual(["songs:5:Track 3", "songs:6:Track 4"]);
  });

  it("matches hyphenated suite tags, makes the suite works and the part-of references", async () => {
    const eagle = await prisma.work.findFirstOrThrow({ where: { title: "Eagle Mall" } });
    expect(eagle).toMatchObject({ suiteStructure: "FIXED" });
    const amagamalin = await prisma.work.findFirstOrThrow({ where: { title: "Amagamalin Street", suiteStructure: { not: null } } });
    expect(amagamalin).toMatchObject({ suiteStructure: "VARIABLE" });
    const parts = await prisma.reference.findMany({ where: { toId: amagamalin.id }, include: { referenceKind: true } });
    expect(parts.map((p) => p.referenceKind.name)).toEqual(["part of", "part of"]);
    // An album song that is also a suite part gets both links. The title song is a part too.
    const peggy = byLegacy(await prisma.work.findMany(), "songs:5");
    const titleSong = byLegacy(await prisma.work.findMany(), "songs:15");
    expect(parts.map((p) => p.fromId).sort()).toEqual([peggy.id, titleSong.id].sort());
    expect(await prisma.sourceWork.count({ where: { workId: peggy.id, source: { title: "Amagamalin Street" } } })).toBe(1);
  });

  it("lists the suite parts that have no known order", async () => {
    const list = JSON.parse(await readFile(path.join(outputDir, "proposals", "09-suite-parts.json"), "utf8"));
    expect(list.rows.map((r: { suite: string }) => r.suite).sort()).toEqual(["Amagamalin Street", "Eagle Mall"]);
    const amagamalin = list.rows.find((r: { suite: string }) => r.suite === "Amagamalin Street");
    expect(amagamalin.parts).toBe("Peggy Test | Amagamalin Street");
  });

  it("rewrites an old internal song link as a wikilink and leaves an unknown slug alone (item 23)", async () => {
    const note = await prisma.note.findFirstOrThrow({ where: { legacyId: "songs:4:publicNotes" } });
    expect(note.body).toBe("See [[song:Alpha Song|Alpha]] and [Missing](/song/nope).");
  });
});

describe("legacy import: rebuild", () => {
  it("empties and rebuilds the target on a second run", async () => {
    const before = await prisma.show.count();
    const result = await runImport({ legacyPool: pool, legacySchema: LEGACY_SCHEMA, db: prisma, settings, outputDir });
    expect(result.unaccounted).toBe(0);
    expect(await prisma.show.count()).toBe(before);
    expect(await prisma.entity.count({ where: { kind: "SHOW" } })).toBe(before);
  }, 60_000);
});
