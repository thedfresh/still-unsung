import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
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

  it("writes a report with no emails, banter text or raw entries", async () => {
    const report = await readFile(path.join(outputDir, "report.md"), "utf8");
    expect(report).toContain("Stress tests");
    for (const secret of ["contrib@example.test", "Banter text one", "setlist text of the entry", "Private show note"]) {
      expect(report).not.toContain(secret);
    }
    const json = await readFile(path.join(outputDir, "report.json"), "utf8");
    expect(json).not.toContain("contrib@example.test");
  });

  it("writes the 17 proposal files and marks them as not applied", async () => {
    const dir = path.join(outputDir, "proposals");
    const names = (await import("node:fs/promises").then((fs) => fs.readdir(dir))).sort();
    expect(names).toHaveLength(17);
    const bill = JSON.parse(await readFile(path.join(dir, "01-bill.json"), "utf8"));
    expect(bill.applied).toBe(false);
    expect(bill.rows.length).toBeGreaterThan(0);
  });
});

describe("legacy import: shows", () => {
  it("leaves out the 2099 test show and everything under it", async () => {
    expect(await prisma.show.count()).toBe(6);
    expect(await prisma.show.findFirst({ where: { dateYear: 2099 } })).toBeNull();
    expect(await prisma.recording.count()).toBe(2);
  });

  it("orders an early and a late show on one date and keeps the date as written only when it differs", async () => {
    const shows = await prisma.show.findMany();
    expect(byLegacy(shows, "events:1")).toMatchObject({ timeLabel: "Early", orderOnDate: 1, dateAsWritten: null });
    expect(byLegacy(shows, "events:2")).toMatchObject({ timeLabel: "Late", orderOnDate: 2 });
    const lone = byLegacy(shows, "events:3");
    expect(lone).toMatchObject({ timeLabel: "Early", orderOnDate: null, dateAsWritten: "June 1st, 1975?" });
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

  it("turns a contributor line into a citation and removes the line from the note", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:1");
    const citations = await prisma.citation.findMany({ where: { entityId: show.id } });
    expect(citations.some((c) => c.legacyId?.startsWith("events:1:publicNotes") && c.contributorId !== null)).toBe(true);
    const notes = await prisma.note.findMany({ where: { attachments: { some: { entityId: show.id } } } });
    const text = notes.map((n) => n.body).join("\n");
    expect(text).toContain("Taped by a fan.");
    expect(text).not.toContain("Contributor: Test Contributor");
  });

  it("cites the raw entry privately, to the legacy setlist source and the named contributor", async () => {
    const show = byLegacy(await prisma.show.findMany(), "events:1");
    const citation = byLegacy(await prisma.citation.findMany({ where: { entityId: show.id } }), "events:1:rawData");
    const source = await prisma.source.findFirstOrThrow({ where: { key: "legacy-setlist-list" } });
    expect(citation.sourceId).toBe(source.id);
    expect(citation.contributorId).not.toBeNull();
    expect(citation.excerpt).toContain("setlist text");
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
    const segment = await prisma.segment.findFirstOrThrow({ where: { set: { showId: show.id } }, include: { work: { include: { workKind: true } } } });
    expect(segment.delivery).toBe("SPOKEN");
    expect(segment.work?.workKind.name).toBe("interview");
  });

  it("maps set types, with a partial set proposed for review", async () => {
    const sets = await prisma.set.findMany({ include: { setType: true } });
    expect(byLegacy(sets, "sets:1").setType.name).toBe("Set");
    expect(byLegacy(sets, "sets:2").setType.name).toBe("Encore");
    expect(byLegacy(sets, "sets:3").setType.name).toBe("Set");
    expect(byLegacy(sets, "sets:3").incompleteReasonId).toBeNull();
    expect(byLegacy(sets, "sets:6").setType.name).toBe("Weird Type");
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

  it("maps the performance flags", async () => {
    const all = await prisma.segment.findMany();
    expect(byLegacy(all, "performances:1")).toMatchObject({ joinsNext: "RUNS_INTO", extent: "PARTIAL" });
    expect(byLegacy(all, "performances:2")).toMatchObject({ extent: "FRAGMENT", workCertainty: "POSSIBLE" });
    expect(byLegacy(all, "performances:3")).toMatchObject({ delivery: "PLAYED", cutAtStart: true, hasGaps: true });
    expect(byLegacy(all, "performances:4").extent).toBe("ABORTED");
  });

  it("writes lead and other singers, and an unknown singer as no person", async () => {
    const segment = byLegacy(await prisma.segment.findMany(), "performances:1");
    const entries = await prisma.vocalEntry.findMany({ where: { segmentId: segment.id } });
    expect(entries.map((e) => e.role).sort()).toEqual(["BACKING", "HARMONY", "LEAD"]);
    expect(entries.find((e) => e.role === "HARMONY")?.personId).toBeNull();
  });

  it("drops a lineup row that repeats the band, keeps an exception, and marks the others absent for solo Hunter", async () => {
    const entries = await prisma.lineupEntry.findMany();
    expect(entries.filter((e) => e.legacyId === "event_musicians:1")).toHaveLength(0);
    expect(entries.filter((e) => e.legacyId === "event_musicians:2")).toHaveLength(1);
    expect(entries.filter((e) => e.legacyId === "performance_musicians:1")).toHaveLength(0);
    const kept = byLegacy(entries, "performance_musicians:2");
    expect(await prisma.lineupInstrument.count({ where: { lineupEntryId: kept.id } })).toBe(1);
    const solo = entries.filter((e) => e.legacyId?.startsWith("performances:solo:"));
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
    const split = JSON.parse(await readFile(path.join(outputDir, "proposals", "08-credit-splits.json"), "utf8"));
    expect(split.rows).toHaveLength(1);
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
  });

  it("writes default singers, with an unknown singer as no person", async () => {
    const alpha = byLegacy(await prisma.work.findMany(), "songs:1");
    const beta = byLegacy(await prisma.work.findMany(), "songs:2");
    expect((await prisma.workSinger.findMany({ where: { workId: alpha.id } })).every((s) => s.personId !== null)).toBe(true);
    expect((await prisma.workSinger.findMany({ where: { workId: beta.id } })).map((s) => s.personId)).toEqual([null]);
  });

  it("keeps the fixed people, makes contributors separate, and proposes the merge", async () => {
    const people = await prisma.person.findMany();
    const hunter = people.filter((p) => p.key === "robert-hunter");
    expect(hunter).toHaveLength(1);
    expect(hunter[0].legacyId).toBe("musicians:1");
    expect(people.find((p) => p.name === "Unknown")).toBeUndefined();
    expect(people.filter((p) => p.name === "Test Guitarist")).toHaveLength(2);
    expect(people.find((p) => p.legacyId === "contributors:1")?.email).toBe("contrib@example.test");
    const merges = JSON.parse(await readFile(path.join(outputDir, "proposals", "06-person-merges.json"), "utf8"));
    expect(merges.rows).toHaveLength(1);
    expect(new Set(people.map((p) => p.key)).size).toBe(people.length);
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
    expect((await prisma.source.findMany()).map((s) => s.zoteroKey).sort()).toEqual(["TESTKEY1", "TESTKEY2", "TESTKEY3"]);
  });
});

describe("legacy import: recordings and links", () => {
  it("maps recordings, tapers and outside IDs", async () => {
    const recording = byLegacy(await prisma.recording.findMany({ include: { recordingType: true } }), "recordings:1");
    expect(recording.recordingType?.name).toBe("SBD");
    expect(recording.taperId).not.toBeNull();
    const unknownType = byLegacy(await prisma.recording.findMany(), "recordings:3");
    expect(unknownType.recordingTypeId).toBeNull();
    const ids = await prisma.externalId.findMany({ where: { entityId: recording.id }, include: { linkSystem: true } });
    expect(ids.map((i) => `${i.linkSystem.name}:${i.value}`).sort()).toEqual(["Live Music Archive:gd99-01-02.test", "SHN:shn1"]);
  });

  it("routes links by their rule", async () => {
    const ids = await prisma.externalId.findMany({ include: { linkSystem: true } });
    expect(ids.some((i) => i.linkSystem.name === "Wikipedia" && i.legacyId === "links:1")).toBe(true);
    expect(ids.find((i) => i.legacyId === "links:5")?.value).toBe("zyxwvutsrqp");
    expect(ids.some((i) => i.legacyId === "links:4")).toBe(false);
    expect(ids.some((i) => i.legacyId === "links:3")).toBe(false);
    const whitegum = byLegacy(await prisma.citation.findMany({ include: { source: true } }), "links:2");
    expect(whitegum.source?.key).toBe("whitegum");
    expect(ids.some((i) => i.value === "12345")).toBe(true);
  });

  it("does not repeat a citation that a contributor line already made", async () => {
    const citations = await prisma.citation.findMany({ where: { legacyId: { startsWith: "event_contributors:" } } });
    expect(citations.map((c) => c.legacyId)).toEqual(["event_contributors:2"]);
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
