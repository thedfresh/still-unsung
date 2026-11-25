import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { PrismaClient } from "@/generated/prisma/client";
import { listShows } from "@/lib/data/shows/list";
import { getShowReview } from "@/lib/data/shows/review";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();

// A second client that counts the queries it sends.
let queries = 0;
const counting = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL as string }),
  log: [{ emit: "event", level: "query" }],
});
counting.$on("query", () => {
  queries += 1;
});

async function countQueries<T>(run: () => Promise<T>): Promise<{ result: T; count: number }> {
  queries = 0;
  const result = await run();
  return { result, count: queries };
}

type Kind = Parameters<typeof db.entity.create>[0]["data"]["kind"];
const entity = async (kind: Kind) => (await db.entity.create({ data: { kind } })).id;

let userId: string;
let sourceId: number;
let personId: number;
let workId: number;
let bandId: number;
let placeId: number;
let placeNameId: number;
let setTypeId: number;
let showTypeId: number;
let kindId: number;
let changesetId: number;

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  userId = (await addUser({ email: "agent@example.test", role: "AGENT" })).id;
  sourceId = await entity("SOURCE");
  await db.source.create({ data: { id: sourceId, zoteroKey: "ZK1", key: "k1", title: "Synthetic notebook", zoteroData: {}, syncedAt: new Date() } });
  personId = await entity("PERSON");
  await db.person.create({ data: { id: personId, name: "Test Speaker", key: "test-speaker" } });
  workId = await entity("WORK");
  const workKind = await db.workKind.findFirstOrThrow();
  await db.work.create({ data: { id: workId, title: "Test Song", workKindId: workKind.id } });
  bandId = await entity("BAND");
  await db.band.create({ data: { id: bandId, name: "Test Band" } });
  placeId = await entity("PLACE");
  await db.place.create({ data: { id: placeId } });
  placeNameId = await entity("PLACE_NAME");
  await db.placeName.create({ data: { id: placeNameId, placeId, name: "Test Radio Studio", position: 1 } });
  setTypeId = (await db.setType.findFirstOrThrow({ where: { name: "First set" } })).id;
  showTypeId = (await db.showType.findFirstOrThrow()).id;
  kindId = (await db.referenceKind.findFirstOrThrow({ where: { name: "mentions" } })).id;
  changesetId = (
    await db.changeset.create({
      data: { userId, path: "MCP", status: "APPLIED", sourceId, place: "page 4", summary: "Synthetic import", appliedAt: new Date("2026-11-25T12:00:00Z") },
    })
  ).id;
});
afterAll(async () => {
  await db.$disconnect();
  await counting.$disconnect();
});

async function makeShow(date: { year: number; month: number; day: number }) {
  const id = await entity("SHOW");
  await db.show.create({
    data: { id, dateYear: date.year, dateMonth: date.month, dateDay: date.day, placeId, placeNameId, bandId, showTypeId },
  });
  return id;
}

async function makeSet(showId: number, position: number) {
  const id = await entity("SET");
  await db.set.create({ data: { id, showId, position, setTypeId } });
  return id;
}

async function makeSegment(setId: number, sortKey: string, extra: { parentId?: number; summary?: string; wordsAsHeard?: string; workId?: number } = {}) {
  const id = await entity("SEGMENT");
  await db.segment.create({ data: { id, setId, sortKey, ...extra } });
  return id;
}

/** A reference, a citation and a note on a segment. */
async function decorate(segmentId: number, label: string) {
  const referenceId = await entity("REFERENCE");
  await db.reference.create({ data: { id: referenceId, fromId: segmentId, toId: workId, referenceKindId: kindId, certainty: "PROBABLE", note: `${label} reference` } });
  await db.citation.create({ data: { entityId: segmentId, sourceId, aspect: "SEGMENT_IDENTIFICATION", place: "page 4", excerpt: `${label} excerpt` } });
  const note = await db.note.create({ data: { body: `${label} private note`, isPublic: false } });
  await db.noteAttachment.create({ data: { noteId: note.id, entityId: segmentId } });
}

async function recordCreated(table: string, recordId: number) {
  await db.changesetItem.create({ data: { changesetId, position: (await db.changesetItem.count()) + 1, tableName: table, recordId, action: "CREATE" } });
}

describe("getShowReview", () => {
  it("returns a show with its sets and segments in order, with everything under each segment", async () => {
    const showId = await makeShow({ year: 1980, month: 11, day: 14 });
    const set2 = await makeSet(showId, 2); // made first on purpose: the position decides the order
    const set1 = await makeSet(showId, 1);
    const parent = await makeSegment(set1, "b", { summary: "The parent summary." });
    const second = await makeSegment(set1, "c", { workId });
    const child = await makeSegment(set1, "a", { parentId: parent, wordsAsHeard: "Words as heard, private." });
    const other = await makeSegment(set2, "a", { summary: "Second set talk." });
    await db.segment.update({ where: { id: second }, data: { joinsNext: "RUNS_INTO" } });
    await decorate(child, "child");
    await decorate(other, "other");
    await recordCreated("shows", showId);
    await recordCreated("segments", child);

    const show = await getShowReview(showId, counting);
    expect(show).not.toBeNull();
    expect(show!.title).toBe("Show 1980-11-14, Test Radio Studio");
    expect(show!.date).toBe("1980-11-14");
    expect(show!.band).toBe("Test Band");
    expect(show!.origin).toBe('Added by the agent on 2026-11-25 from the source "Synthetic notebook" (page 4)');
    // Sets by position; in a set, the parent comes first, then its child (sortKey "a" is
    // before the parent's own "b", but a child belongs under its parent), then the next sibling.
    expect(show!.sets.map((set) => set.position)).toEqual([1, 2]);
    const [first, secondSet] = show!.sets;
    expect(first.segments.map((s) => [s.number, s.depth])).toEqual([["1", 0], ["1.1", 1], ["2", 0]]);
    expect(first.segments[0].summary).toBe("The parent summary.");
    expect(first.segments[2].work).toBe("Test Song");
    expect(first.segments[2].joinMark).toBe(">");
    expect(secondSet.segments.map((s) => s.summary)).toEqual(["Second set talk."]);

    const childView = first.segments[1];
    expect(childView.wordsAsHeard).toBe("Words as heard, private.");
    // The show and the child come from the same change: the page says it once, under the show.
    expect(childView.origin).toBeNull();
    expect(childView.attachments.references).toEqual([
      expect.objectContaining({ kind: "mentions", target: 'work "Test Song"', certainty: "probable", note: "child reference" }),
    ]);
    expect(childView.attachments.citations).toEqual([
      expect.objectContaining({ by: 'Source "Synthetic notebook"', aspect: "segment identification", place: "page 4", excerpt: "child excerpt" }),
    ]);
    expect(childView.attachments.notes).toEqual([expect.objectContaining({ body: "child private note", isPublic: false })]);
    // A record with no stored creation has no origin line.
    expect(show!.sets[0].segments[0].origin).toBeNull();
  });

  it("says where it came from once, and again only on a record from another change", async () => {
    const showId = await makeShow({ year: 1980, month: 11, day: 14 });
    const set = await makeSet(showId, 1);
    const a = await makeSegment(set, "a", { summary: "One." });
    const b = await makeSegment(set, "b", { summary: "Two." });
    const c = await makeSegment(set, "c", { summary: "Three." });
    for (const [table, id] of [["shows", showId], ["segments", a], ["segments", b]] as const) await recordCreated(table, id);
    const later = await db.changeset.create({
      data: { userId, path: "MCP", status: "APPLIED", sourceId, place: "page 9", summary: "Later import", appliedAt: new Date("2026-11-26T12:00:00Z") },
    });
    await db.changesetItem.create({ data: { changesetId: later.id, position: 1, tableName: "segments", recordId: c, action: "CREATE" } });

    const show = await getShowReview(showId, counting);
    expect(show!.origin).toBe('Added by the agent on 2026-11-25 from the source "Synthetic notebook" (page 4)');
    const [first, second, third] = show!.sets[0].segments;
    expect([first.origin, second.origin]).toEqual([null, null]);
    expect(third.origin).toBe('Added by the agent on 2026-11-26 from the source "Synthetic notebook" (page 9)');
  });

  it("takes the header line from the change that created the show, even when a later change made more records", async () => {
    const showId = await makeShow({ year: 1978, month: 4, day: 15 });
    const set = await makeSet(showId, 1);
    const talk = await makeSegment(set, "a", { summary: "Introduces the song." });
    await recordCreated("shows", showId);
    // Grooming later adds more records (references) than the import made.
    const grooming = await db.changeset.create({
      data: { userId, path: "MCP", status: "APPLIED", ownKnowledge: true, summary: "Grooming", appliedAt: new Date("2026-11-26T12:00:00Z") },
    });
    for (let i = 0; i < 3; i++) {
      const refId = await entity("REFERENCE");
      await db.reference.create({ data: { id: refId, fromId: talk, toId: personId, referenceKindId: kindId } });
      await db.changesetItem.create({ data: { changesetId: grooming.id, position: i + 1, tableName: "references", recordId: refId, action: "CREATE" } });
    }

    const show = await getShowReview(showId, counting);
    expect(show!.origin).toBe('Added by the agent on 2026-11-25 from the source "Synthetic notebook" (page 4)');
    const refs = show!.sets[0].segments[0].attachments.references;
    expect(refs).toHaveLength(3);
    expect(refs.every((ref) => ref.origin === "Added by the agent on 2026-11-26 from own knowledge")).toBe(true);
  });

  it("has no header line when the show's creation is not stored, and each record keeps its own", async () => {
    const showId = await makeShow({ year: 1990, month: 11, day: 6 });
    const set = await makeSet(showId, 1);
    const talk = await makeSegment(set, "a", { summary: "Talk." });
    const refId = await entity("REFERENCE");
    await db.reference.create({ data: { id: refId, fromId: talk, toId: personId, referenceKindId: kindId } });
    await db.changesetItem.create({ data: { changesetId, position: 1, tableName: "references", recordId: refId, action: "CREATE" } });

    const show = await getShowReview(showId, counting);
    expect(show!.origin).toBeNull();
    expect(show!.sets[0].segments[0].attachments.references[0].origin).toBe('Added by the agent on 2026-11-25 from the source "Synthetic notebook" (page 4)');
  });

  it("writes a bill entry as its role, a colon and a space, then the act", async () => {
    const showId = await makeShow({ year: 1990, month: 11, day: 6 });
    const billId = await entity("BILL_ENTRY");
    await db.billEntry.create({ data: { id: billId, showId, actBandId: bandId, role: "OPENER", position: 1 } });
    const show = await getShowReview(showId, counting);
    expect(show!.bill.map((line) => line.text)).toEqual(["opener: Test Band"]);
  });

  it("names every kind of reference target, and a citation of this show's own recording is short", async () => {
    const showId = await makeShow({ year: 1980, month: 11, day: 14 });
    const set = await makeSet(showId, 1);
    const segment = await makeSegment(set, "a", { summary: "One." });
    const groupId = await entity("SHOW_GROUP");
    await db.showGroup.create({ data: { id: groupId, name: "Fall tour", showGroupKindId: (await db.showGroupKind.findFirstOrThrow()).id } });
    const passageId = await entity("PASSAGE");
    await db.passage.create({ data: { id: passageId, workId, label: "verse 2" } });
    for (const toId of [groupId, passageId]) {
      const id = await entity("REFERENCE");
      await db.reference.create({ data: { id, fromId: segment, toId, referenceKindId: kindId } });
    }
    const recordingId = await entity("RECORDING");
    await db.recording.create({ data: { id: recordingId, showId } });
    await db.citation.create({ data: { entityId: segment, recordingId, aspect: "SEGMENT_IDENTIFICATION", place: "12:30" } });

    const view = (await getShowReview(showId, counting))!.sets[0].segments[0];
    expect(view.attachments.references.map((r) => r.target)).toEqual(['show group "Fall tour"', 'passage "verse 2"']);
    expect(view.attachments.citations[0]).toMatchObject({ by: "This show's recording, 12:30", place: null });
  });

  it("returns null for a show that does not exist", async () => {
    expect(await getShowReview(999_999, counting)).toBeNull();
  });

  it("runs the same number of queries for a small show and a large one", async () => {
    const small = await makeShow({ year: 1980, month: 11, day: 14 });
    const smallSet = await makeSet(small, 1);
    const smallSegment = await makeSegment(smallSet, "a", { workId });
    await decorate(smallSegment, "small");

    const large = await makeShow({ year: 1981, month: 1, day: 2 });
    for (let s = 1; s <= 3; s += 1) {
      const set = await makeSet(large, s);
      for (let i = 0; i < 6; i += 1) {
        const id = await makeSegment(set, String.fromCharCode(97 + i), { workId });
        await decorate(id, `large ${s}.${i}`);
        await recordCreated("segments", id);
      }
    }

    const a = await countQueries(() => getShowReview(small, counting));
    const b = await countQueries(() => getShowReview(large, counting));
    expect(b.result!.sets.flatMap((set) => set.segments)).toHaveLength(18);
    expect(b.count).toBe(a.count);
    // Show, sets, segments, references, citations, notes and origins.
    expect(a.count).toBe(7);
  });
});

describe("links from the Changes page", () => {
  it("names the show of each change, whether the item is the show, a set or a segment", async () => {
    const showId = await makeShow({ year: 1980, month: 11, day: 14 });
    const setId = await makeSet(showId, 1);
    const segmentId = await makeSegment(setId, "a");
    const otherShow = await makeShow({ year: 1981, month: 2, day: 3 });
    const items = [
      { tableName: "shows", recordId: showId, after: { id: showId } },
      { tableName: "segments", recordId: segmentId, after: { id: segmentId, setId } },
      { tableName: "citations", recordId: 1, after: { entityId: segmentId } },
      { tableName: "sets", recordId: otherShow + 1, after: { showId: otherShow } },
    ];
    await db.changesetItem.createMany({
      data: items.map((item, index) => ({ changesetId, position: index + 1, action: "CREATE" as const, ...item })),
    });
    const { listChangesets } = await import("@/lib/data/changes/list");
    const [change] = (await listChangesets()).changes;
    expect(change.shows).toEqual([
      { id: showId, label: "Show 1980-11-14, Test Radio Studio" },
      { id: otherShow, label: "Show 1981-02-03, Test Radio Studio" },
    ]);
  });
});

describe("listShows", () => {
  it("lists newest first, with set and segment counts, and searches by date and place name", async () => {
    const older = await makeShow({ year: 1980, month: 11, day: 14 });
    const olderSet = await makeSet(older, 1);
    await makeSegment(olderSet, "a");
    await makeSegment(olderSet, "b");
    const newer = await makeShow({ year: 1981, month: 2, day: 3 });
    await makeSet(newer, 1);
    await makeSet(newer, 2);

    const all = await listShows("", 1, counting);
    expect(all.total).toBe(2);
    expect(all.rows.map((row) => row.date)).toEqual(["1981-02-03", "1980-11-14"]);
    expect(all.rows[1]).toMatchObject({ placeName: "Test Radio Studio", band: "Test Band", setCount: 1, segmentCount: 2 });
    expect(all.rows[0]).toMatchObject({ setCount: 2, segmentCount: 0 });

    for (const [query, expected] of [
      ["1980", ["1980-11-14"]],
      ["1980-11", ["1980-11-14"]],
      ["1980-11-14", ["1980-11-14"]],
      ["1980-11-15", []],
      ["radio", ["1981-02-03", "1980-11-14"]],
      ["nowhere", []],
    ] as const) {
      expect((await listShows(query, 1, counting)).rows.map((row) => row.date), query).toEqual(expected);
    }
  });

  it("pages 50 to a page", async () => {
    for (let i = 0; i < 52; i += 1) await makeShow({ year: 1970 + (i % 10), month: 1 + (i % 12), day: 1 + (i % 28) });
    const first = await listShows("", 1, counting);
    expect([first.rows.length, first.pageCount, first.total]).toEqual([50, 2, 52]);
    expect((await listShows("", 2, counting)).rows).toHaveLength(2);
    expect((await listShows("", 99, counting)).page).toBe(2);
  });
});
