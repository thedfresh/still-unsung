import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { saveAdminChanges } from "@/lib/data/changes/admin-save";
import { listEntities } from "@/lib/data/entity-lists";
import { searchPicker } from "@/lib/data/picker";
import { getShowEditData } from "@/lib/data/shows/edit";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CurrentUser, Role } from "@/lib/roles";
import {
  addBillEdit,
  addNoteEdits,
  addSegmentEdit,
  addSetEdit,
  draftOfShow,
  moveBillEdits,
  moveSegmentEdit,
  moveSetEdits,
  nestSegmentEdit,
  parsePlacement,
  removeBillEdit,
  removeNoteEdit,
  setTypeEdit,
  showFieldsEdit,
  unnestSegmentEdit,
  updateNoteEdit,
  updateSegmentEdit,
  draftOfSegment,
  BLANK_SEGMENT,
  type Built,
} from "@/lib/shows/edit-edits";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
let admin: CurrentUser;
let showId: number;
let bandId: number;
let workId: number;

const asAdmin = async (roles: readonly Role[]) => {
  if (!roles.includes(admin.role)) throw new AppError("forbidden");
  return admin;
};
const signedOut = async (): Promise<CurrentUser> => {
  throw new AppError("unauthorized");
};
const own = { ownKnowledge: true };

/** Save what a builder made, as the editor does: it must be one saved changeset. */
async function save(built: Built) {
  if ("error" in built) throw new Error(built.error);
  const before = await db.changeset.count();
  const result = await saveAdminChanges({ edits: built.edits, evidence: own }, asAdmin);
  expect(result.status, JSON.stringify(result)).toBe("saved");
  expect(await db.changeset.count()).toBe(before + 1);
  return db.changeset.findFirstOrThrow({ orderBy: { id: "desc" }, include: { items: true } });
}

const load = async () => (await getShowEditData(showId))!;

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  const row = await addUser({ email: "admin@example.test", role: "ADMIN" });
  admin = { id: row.id, email: "admin@example.test", name: null, role: "ADMIN", via: "session" };
  const show = await db.entity.create({ data: { kind: "SHOW" } });
  await db.show.create({ data: { id: show.id, dateYear: 1978, dateMonth: 5, dateDay: 23 } });
  showId = show.id;
  const band = await db.entity.create({ data: { kind: "BAND" } });
  await db.band.create({ data: { id: band.id, name: "The Test Band" } });
  bandId = band.id;
  const work = await db.entity.create({ data: { kind: "WORK" } });
  await db.work.create({ data: { id: work.id, title: "Test Song", workKindId: (await db.workKind.findFirstOrThrow()).id } });
  workId = work.id;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("show fields", () => {
  it("saves a partial date, the place with its name and the band as one changeset", async () => {
    const place = await db.entity.create({ data: { kind: "PLACE" } });
    await db.place.create({ data: { id: place.id } });
    const name1 = await db.entity.create({ data: { kind: "PLACE_NAME" } });
    await db.placeName.create({ data: { id: name1.id, placeId: place.id, name: "Old Hall", position: 1 } });
    const name2 = await db.entity.create({ data: { kind: "PLACE_NAME" } });
    await db.placeName.create({ data: { id: name2.id, placeId: place.id, name: "New Hall", position: 2 } });
    const show = await load();
    const draft = { ...draftOfShow(show), day: "", month: "6", placeId: place.id, placeNameId: name2.id, bandId, status: "CANCELED" };
    const set = await save(showFieldsEdit(show, draft));
    expect(set.items).toHaveLength(1);
    const row = await db.show.findUniqueOrThrow({ where: { id: showId } });
    expect([row.dateYear, row.dateMonth, row.dateDay]).toEqual([1978, 6, null]);
    expect([row.placeId, row.placeNameId, row.bandId, row.status]).toEqual([place.id, name2.id, bandId, "CANCELED"]);
    expect(set.path).toBe("ADMIN");
  });

  it("refuses a day without a month before any save", async () => {
    const show = await load();
    expect(showFieldsEdit(show, { ...draftOfShow(show), month: "", day: "3" })).toEqual({ error: "Enter the month too, or clear the day." });
  });

  it("refuses a stale rev, writes nothing and returns both versions", async () => {
    const show = await load();
    await save(showFieldsEdit(show, { ...draftOfShow(show), billedAs: "First" }));
    const stale = showFieldsEdit(show, { ...draftOfShow(show), billedAs: "Second" });
    if ("error" in stale) throw new Error(stale.error);
    const before = await db.changeset.count({ where: { status: "APPLIED" } });
    const result = await saveAdminChanges({ edits: stale.edits, evidence: own }, asAdmin);
    expect(result.status).toBe("conflict");
    expect(await db.changeset.count({ where: { status: "APPLIED" } })).toBe(before);
    expect((await db.show.findUniqueOrThrow({ where: { id: showId } })).billedAs).toBe("First");
  });

  it("makes no change and reads no data for a signed-out request", async () => {
    const show = await load();
    const edit = showFieldsEdit(show, { ...draftOfShow(show), billedAs: "No" });
    if ("error" in edit) throw new Error(edit.error);
    await expect(saveAdminChanges({ edits: edit.edits, evidence: own }, signedOut)).rejects.toMatchObject({ code: "unauthorized" });
    expect(await db.changeset.count()).toBe(0);
    expect((await db.show.findUniqueOrThrow({ where: { id: showId } })).billedAs).toBeNull();
  });
});

describe("sets and segments", () => {
  it("adds sets, changes a set type and moves a set, each as one changeset", async () => {
    await save(addSetEdit(await load(), (await db.setType.findFirstOrThrow()).id));
    await save(addSetEdit(await load(), (await db.setType.findFirstOrThrow()).id));
    let show = await load();
    expect(show.sets.map((s) => s.position)).toEqual([1, 2]);
    const other = await db.setType.findFirstOrThrow({ where: { id: { not: show.sets[0].setTypeId } } });
    await save(setTypeEdit(show.sets[0], other.id));
    show = await load();
    expect(show.sets[0].setTypeId).toBe(other.id);
    const [a, b] = show.sets.map((s) => s.id);
    await save(moveSetEdits(show.sets, b, -1));
    show = await load();
    expect(show.sets.map((s) => s.id)).toEqual([b, a]);
  });

  it("adds segments at the end, after and inside one, with the right order and parent", async () => {
    await save(addSetEdit(await load(), (await db.setType.findFirstOrThrow()).id));
    const setId = (await load()).sets[0].id;
    const add = async (where: string, summary: string) => {
      const set = (await load()).sets[0];
      await save(addSegmentEdit(setId, set.segments, parsePlacement(where), { ...BLANK_SEGMENT, summary, workId }));
    };
    await add("end", "one");
    await add("end", "three");
    const first = (await load()).sets[0].segments[0].id;
    await add(`after:${first}`, "two");
    const third = (await load()).sets[0].segments.find((s) => s.summary === "three")!.id;
    await add(`inside:${third}`, "three-a");
    const segments = (await load()).sets[0].segments;
    expect(segments.map((s) => `${s.number}:${s.summary}:${s.depth}`)).toEqual(["1:one:0", "2:two:0", "3:three:0", "3.1:three-a:1"]);
    expect(segments[0].workTitle).toBe("Test Song");
  });

  it("edits a segment's fields, moves it, nests it and takes it out, each as one changeset", async () => {
    await save(addSetEdit(await load(), (await db.setType.findFirstOrThrow()).id));
    const setId = (await load()).sets[0].id;
    for (const summary of ["a", "b", "c"]) {
      await save(addSegmentEdit(setId, (await load()).sets[0].segments, { kind: "end" }, { ...BLANK_SEGMENT, summary }));
    }
    const by = async (summary: string) => (await load()).sets[0].segments.find((s) => s.summary === summary)!;
    const all = async () => (await load()).sets[0].segments;

    await save(moveSegmentEdit(await all(), (await by("c")).id, -1));
    expect((await all()).map((s) => s.summary)).toEqual(["a", "c", "b"]);

    await save(nestSegmentEdit(await all(), (await by("c")).id));
    expect((await by("c")).parentId).toBe((await by("a")).id);
    expect((await by("c")).number).toBe("1.1");

    await save(unnestSegmentEdit(await all(), (await by("c")).id));
    expect((await all()).map((s) => `${s.summary}:${s.depth}`)).toEqual(["a:0", "c:0", "b:0"]);

    const segment = await by("b");
    const draft = { ...draftOfSegment(segment), delivery: "SUNG", extent: "ABORTED", joinsNext: true, portionNote: "first verse", workId };
    const change = await save(updateSegmentEdit(segment, draft));
    expect(change.items).toHaveLength(1);
    const stored = await db.segment.findUniqueOrThrow({ where: { id: segment.id } });
    expect([stored.delivery, stored.extent, stored.joinsNext, stored.portionNote, stored.workId]).toEqual(["SUNG", "ABORTED", "RUNS_INTO", "first verse", workId]);
  });

  it("drops extent and portion for a spoken segment", async () => {
    await save(addSetEdit(await load(), (await db.setType.findFirstOrThrow()).id));
    const setId = (await load()).sets[0].id;
    await save(addSegmentEdit(setId, [], { kind: "end" }, { ...BLANK_SEGMENT, delivery: "SPOKEN", extent: "PARTIAL", portionNote: "x" }));
    const stored = await db.segment.findFirstOrThrow();
    expect([stored.delivery, stored.extent, stored.portionNote]).toEqual(["SPOKEN", "COMPLETE", null]);
  });
});

describe("bill and notes", () => {
  it("adds, moves and removes bill entries", async () => {
    await save(addBillEdit(showId, [], { act: { kind: "band", id: bandId }, role: "HEADLINER", certainty: "CONFIRMED" }));
    await save(addBillEdit(showId, (await load()).bill, { act: { kind: "band", id: bandId }, role: "OPENER", certainty: "PROBABLE" }));
    let bill = (await load()).bill;
    expect(bill.map((b) => b.role)).toEqual(["HEADLINER", "OPENER"]);
    await save(moveBillEdits(bill, bill[1].id, -1));
    bill = (await load()).bill;
    expect(bill.map((b) => b.role)).toEqual(["OPENER", "HEADLINER"]);
    await save(removeBillEdit(bill[0]));
    expect((await load()).bill.map((b) => b.role)).toEqual(["HEADLINER"]);
  });

  it("adds a note with its link in one changeset, edits it and removes it", async () => {
    const change = await save(addNoteEdits(showId, "A private remark.", false));
    expect(change.items.map((i) => i.tableName).sort()).toEqual(["note_attachments", "notes"]);
    let note = (await load()).notes[0];
    expect([note.body, note.isPublic]).toEqual(["A private remark.", false]);
    await save(updateNoteEdit(note, "A public remark.", true));
    note = (await load()).notes[0];
    expect([note.body, note.isPublic]).toEqual(["A public remark.", true]);
    await save(removeNoteEdit(note));
    expect((await load()).notes).toHaveLength(0);
    expect(await db.note.count()).toBe(0);
  });

  it("keeps a removed note that another record still uses", async () => {
    await save(addNoteEdits(showId, "A shared remark.", false));
    const note = (await load()).notes[0];
    await db.noteAttachment.create({ data: { noteId: note.noteId, entityId: bandId } });
    const shared = (await load()).notes[0];
    expect(shared.alsoAttachedTo).toBe(1);
    await save(removeNoteEdit(shared));
    expect((await load()).notes).toHaveLength(0);
    expect(await db.note.count({ where: { id: note.noteId } })).toBe(1);
    expect(await db.noteAttachment.count({ where: { noteId: note.noteId, entityId: bandId } })).toBe(1);
  });
});

describe("pickers and lists", () => {
  it("shows a work's variants in the work choices", async () => {
    const version = await db.entity.create({ data: { kind: "VERSION" } });
    await db.version.create({ data: { id: version.id, workId, name: "Studio" } });
    const variant = await db.entity.create({ data: { kind: "VARIANT" } });
    await db.variant.create({ data: { id: variant.id, versionId: version.id, name: "Slow variant" } });
    const [choice] = await searchPicker("work", "test");
    expect(choice).toMatchObject({ id: workId, label: "Test Song", hint: "Variants: Slow variant" });
  });

  it("finds a work or a person by part of an other name, ignoring case", async () => {
    await db.work.update({ where: { id: workId }, data: { otherNames: ["Wharf Rat Blues"] } });
    expect((await searchPicker("work", "harf RAT")).map((c) => c.id)).toEqual([workId]);
    expect(await searchPicker("work", "no such name")).toEqual([]);
    expect(await searchPicker("work", "100%")).toEqual([]);
    const entity = await db.entity.create({ data: { kind: "PERSON" } });
    await db.person.create({ data: { id: entity.id, name: "Jerome Garcia", key: "jerome-garcia", otherNames: ["Captain Trips"] } });
    expect((await searchPicker("person", "tain tri")).map((c) => c.id)).toEqual([entity.id]);
    expect(await searchPicker("person", "zzz")).toEqual([]);
  });

  it("sorts names without a leading The, A or An", async () => {
    for (const name of ["Cats", "The Aces", "A Boat"]) {
      const band = await db.entity.create({ data: { kind: "BAND" } });
      await db.band.create({ data: { id: band.id, name } });
    }
    const names = (await listEntities("bands", "", "name", 1)).rows.map((r) => r.name);
    expect(names).toEqual(["The Aces", "A Boat", "Cats", "The Test Band"]);
    const searched = await listEntities("bands", "boat", "name", 1);
    expect(searched.rows.map((r) => r.name)).toEqual(["A Boat"]);
  });
});
