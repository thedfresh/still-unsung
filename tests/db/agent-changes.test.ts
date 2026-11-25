import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { Prisma } from "@/generated/prisma/client";
import { applyChanges } from "@/lib/data/changes/apply";
import { listChangesets } from "@/lib/data/changes/list";
import { previewChanges } from "@/lib/data/changes/preview";
import { getRecord, searchRecords } from "@/lib/data/records";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { formatPreview } from "@/lib/changes/preview-format";
import { formatApplyResult } from "@/lib/mcp/format";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
let agentId: string;
let sourceId: number;
let setTypeId: number;

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  agentId = (await addUser({ email: "agent@example.test", role: "AGENT" })).id;
  const source = await db.entity.create({ data: { kind: "SOURCE" } });
  await db.source.create({ data: { id: source.id, zoteroKey: "ZK1", key: "k1", title: "Synthetic notebook", zoteroData: {}, syncedAt: new Date() } });
  sourceId = source.id;
  setTypeId = (await db.setType.findFirstOrThrow()).id;
});
afterAll(async () => {
  await db.$disconnect();
});

const evidence = () => ({ sourceId, place: "page 4" });

async function makeShow() {
  const preview = await previewChanges(agentId, {
    evidence: evidence(),
    edits: [{ op: "create", type: "Show", fields: { dateYear: 1978, dateMonth: 5, dateDay: 23 } }],
  });
  await applyChanges(agentId, preview.token as string);
  return db.show.findFirstOrThrow();
}

describe("preview and apply", () => {
  it("previews a change without writing it, then applies it with a changeset", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Late" } }],
    });
    expect(preview.warnings).toEqual([]);
    expect(preview.token).toMatch(/^suprev_/);
    expect(formatPreview(preview)).toContain("time label: “Late”");
    expect((await db.show.findUniqueOrThrow({ where: { id: show.id } })).timeLabel).toBeNull();

    const result = await applyChanges(agentId, preview.token as string);
    expect(result.ok).toBe(true);
    const after = await db.show.findUniqueOrThrow({ where: { id: show.id } });
    expect(after.timeLabel).toBe("Late");
    expect(after.rev).toBe(show.rev + 1);

    const [change] = (await listChangesets()).changes;
    expect(change).toMatchObject({ path: "MCP", status: "APPLIED", userEmail: "agent@example.test", userRole: "AGENT" });
    expect(change.evidence).toContain("Synthetic notebook");
    const item = change.items.find((i) => i.tableName === "shows");
    expect(item?.before).toMatchObject({ timeLabel: null, rev: show.rev });
    expect(item?.after).toMatchObject({ timeLabel: "Late" });
    // The evidence stays on the changeset. No citation is written from it (item 109).
    expect(await db.citation.count()).toBe(0);
    expect(formatPreview(preview)).not.toContain("Citations written");
  });

  it("creates a show with its sets and segments that point at each other", async () => {
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Show", ref: "show", fields: { dateYear: 1980, dateMonth: 2 } },
        { op: "create", type: "Set", ref: "set", fields: { showId: { ref: "show" }, position: 1, setTypeId } },
        { op: "create", type: "Segment", fields: { setId: { ref: "set" }, sortKey: "a" } },
      ],
    });
    expect(preview.warnings).toEqual([]);
    expect(preview.items.map((i) => i.type)).toEqual(["Show", "Set", "Segment"]);
    // Every record of the show sits under the show's heading.
    expect(preview.items.map((i) => i.parent?.type)).toEqual(["Show", "Show", "Show"]);
    expect(preview.items[1].parent?.label).toContain("Show 1980-02");
    expect(preview.isPublic).toBe(true);
    expect(await db.show.count()).toBe(0);
    await applyChanges(agentId, preview.token as string);
    expect(await db.show.count()).toBe(1);
    expect(await db.segment.count()).toBe(1);
    // Each new shared record has its entities row.
    expect(await db.entity.count({ where: { kind: { in: ["SHOW", "SET", "SEGMENT"] } } })).toBe(3);
  });

  it("previews and applies a segment with a summary and the delivery recording played", async () => {
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Show", ref: "show", fields: { dateYear: 1980, dateMonth: 11, dateDay: 14 } },
        { op: "create", type: "Set", ref: "set", fields: { showId: { ref: "show" }, position: 1, setTypeId } },
        { op: "create", type: "Segment", fields: { setId: { ref: "set" }, sortKey: "a", delivery: "RECORDING_PLAYED", summary: "A tape of the band plays on air." } },
      ],
    });
    expect(preview.warnings).toEqual([]);
    const text = formatPreview(preview);
    expect(text).toContain("delivery: recording played");
    expect(text).toContain("summary: “A tape of the band plays on air.”");
    expect(text).toContain("public: summary and references · words: private");
    expect(text).not.toContain("wordsPublic");
    await applyChanges(agentId, preview.token as string);
    expect(await db.segment.findFirstOrThrow()).toMatchObject({ delivery: "RECORDING_PLAYED", summary: "A tape of the band plays on air." });
  });

  it("works once", async () => {
    const preview = await previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [{ op: "create", type: "Show", fields: { dateYear: 1990 } }] });
    await applyChanges(agentId, preview.token as string);
    await expect(applyChanges(agentId, preview.token as string)).rejects.toMatchObject({ code: "not_found" });
    expect(await db.show.count()).toBe(1);
    expect(await db.citation.count()).toBe(0); // own knowledge writes no citation
  });

  it("refuses an expired token and another user's token", async () => {
    const other = (await addUser({ email: "agent2@example.test", role: "AGENT" })).id;
    const preview = await previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [{ op: "create", type: "Show", fields: { dateYear: 1990 } }] });
    await expect(applyChanges(other, preview.token as string)).rejects.toMatchObject({ code: "not_found" });
    await db.changeset.update({ where: { id: preview.changesetId as number }, data: { previewExpiresAt: new Date(Date.now() - 1000) } });
    await expect(applyChanges(agentId, preview.token as string)).rejects.toMatchObject({ code: "not_found" });
    expect(await db.show.count()).toBe(0);
  });
});

describe("highlights (item 110)", () => {
  it("links to a new source by ref in one preview, and reads a reference to a talk segment by its summary", async () => {
    const partOf = await db.referenceKind.findUniqueOrThrow({ where: { name: "part of" } });
    const summary = "Hunter talks about the new record.";
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Show", ref: "show", fields: { dateYear: 1980, dateMonth: 11, dateDay: 14 } },
        { op: "create", type: "Set", ref: "set", fields: { showId: { ref: "show" }, position: 1, setTypeId } },
        { op: "create", type: "Segment", ref: "talk", fields: { setId: { ref: "set" }, sortKey: "a", delivery: "SPOKEN", summary } },
        { op: "create", type: "Source", ref: "jor", fields: { key: "jor", title: "A new source", otherNames: [] } },
        { op: "create", type: "Reference", fields: { fromId: { ref: "talk" }, toId: { ref: "jor" }, referenceKindId: partOf.id } },
      ],
    });
    expect(preview.warnings).toEqual([]);
    expect(await db.reference.count()).toBe(0);
    await applyChanges(agentId, preview.token as string);
    const reference = await db.reference.findFirstOrThrow();
    expect(reference.toId).toBe((await db.source.findFirstOrThrow({ where: { key: "jor" } })).id);
    // A later reference to the stored talk segment reads by its summary.
    const next = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Reference", fields: { fromId: reference.fromId, toId: reference.toId, referenceKindId: partOf.id, note: "Again." } }],
    });
    expect(formatPreview(next)).toContain(`${summary}, 1980-11-14`);
  });

  it("marks a show with a part-of reference to a highlight subject, with a note", async () => {
    const show = await makeShow();
    const kind = await db.subjectKind.findUniqueOrThrow({ where: { name: "highlight" } });
    const partOf = await db.referenceKind.findUniqueOrThrow({ where: { name: "part of" } });
    // A reference points at an Entity, so the subject is made first and the reference names its id.
    const subjectPreview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Subject", fields: { name: "Notable show", subjectKindId: kind.id } }],
    });
    await applyChanges(agentId, subjectPreview.token as string);
    const subject = await db.subject.findFirstOrThrow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        {
          op: "create",
          type: "Reference",
          fields: { fromId: show.id, toId: subject.id, referenceKindId: partOf.id, note: "The first night of the run." },
        },
      ],
    });
    expect(preview.warnings).toEqual([]);
    await applyChanges(agentId, preview.token as string);
    const reference = await db.reference.findFirstOrThrow({ include: { referenceKind: true, to: { include: { subject: true } } } });
    expect(reference).toMatchObject({ fromId: show.id, note: "The first night of the run." });
    expect(reference.referenceKind.name).toBe("part of");
    expect(reference.to.subject?.subjectKindId).toBe(kind.id);
  });
});

describe("readout (HSA-159)", () => {
  it("gives the preview and the Changes page the same text, with names for links", async () => {
    const partOf = await db.referenceKind.findUniqueOrThrow({ where: { name: "part of" } });
    const edits = [
      { op: "create", type: "Show", ref: "show", fields: { dateYear: 1980, dateMonth: 11, dateDay: 14 } },
      { op: "create", type: "Set", ref: "set", fields: { showId: { ref: "show" }, position: 1, setTypeId } },
      { op: "create", type: "Work", ref: "work", fields: { title: "Ripple", workKindId: (await db.workKind.findFirstOrThrow()).id } },
      { op: "create", type: "Segment", ref: "talk", fields: { setId: { ref: "set" }, sortKey: "a", delivery: "SPOKEN", summary: "Hunter talks.", workId: { ref: "work" }, workCertainty: "PROBABLE" } },
      { op: "create", type: "Reference", fields: { fromId: { ref: "talk" }, toId: { ref: "work" }, referenceKindId: partOf.id, certainty: "POSSIBLE" } },
    ];
    for (let i = 0; i < 40; i++) edits.push({ op: "create", type: "Segment", fields: { setId: { ref: "set" }, sortKey: `b${String(i).padStart(2, "0")}` } } as never);
    const preview = await previewChanges(agentId, { evidence: evidence(), edits });
    expect(preview.warnings).toEqual([]);
    const previewReadout = formatPreview(preview).split("\n\nEvidence:")[0];
    await applyChanges(agentId, preview.token as string);
    const [change] = (await listChangesets()).changes;
    expect(change.readout).toBe(previewReadout);
    expect(change.counts).toBe(previewReadout.split("\n")[0]);
    expect(change.counts).toContain("Added 1 show, 1 set, 1 work, 41 segments and 1 reference");
    expect(change.readout).toContain("New work: Ripple");
    expect(change.readout).toContain("Not confirmed");
    // One heading for the show: every record sits under it, none by raw IDs alone.
    expect(change.readout.split("\n").filter((l) => l.startsWith("Show 1980-11-14"))).toHaveLength(1);
    expect(change.readout).toContain("New Reference: Hunter talks., 1980-11-14 part of Ripple");
  });

  it("pages the log, newest first", async () => {
    for (const year of [1990, 1991, 1992]) {
      const preview = await previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [{ op: "create", type: "Show", fields: { dateYear: year } }] });
      await applyChanges(agentId, preview.token as string);
    }
    const first = await listChangesets(1, 2);
    const second = await listChangesets(2, 2);
    expect(first.total).toBe(3);
    expect(first.changes).toHaveLength(2);
    expect(second.changes).toHaveLength(1);
    expect(first.changes[0].readout).toContain("1992");
    expect(second.changes[0].readout).toContain("1990");
  });

  it("gives the last page for a page past the end", async () => {
    const preview = await previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [{ op: "create", type: "Show", fields: { dateYear: 1990 } }] });
    await applyChanges(agentId, preview.token as string);
    const past = await listChangesets(99, 2);
    expect(past.page).toBe(1);
    expect(past.changes).toHaveLength(1);
  });

  it("groups a citation under the record it supports, not under its source", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Citation", fields: { entityId: show.id, sourceId, place: "page 9", excerpt: "Ad for the show" } }],
    });
    await applyChanges(agentId, preview.token as string);
    const [change] = (await listChangesets()).changes;
    expect(change.counts).toBe("Added 1 citation to 1 show.");
    expect(change.readoutData.groups.map((g) => g.heading)).toEqual(["Show 1978-05-23"]);
  });

  it("stores the final ID for a record that has no name", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Note", ref: "note", fields: { body: "A note" } },
        { op: "create", type: "NoteAttachment", fields: { noteId: { ref: "note" }, entityId: show.id } },
      ],
    });
    await applyChanges(agentId, preview.token as string);
    const attachment = await db.noteAttachment.findFirstOrThrow();
    const [change] = (await listChangesets()).changes;
    expect(change.items.find((i) => i.tableName === "note_attachments")?.label).toBe(`NoteAttachment #${attachment.id}`);
    expect(change.readoutData.groups).toHaveLength(1);
  });

  it("reads a change stored before the names were saved, in words, under one heading", async () => {
    const show = await makeShow();
    const kind = await db.subjectKind.findUniqueOrThrow({ where: { name: "highlight" } });
    const partOf = await db.referenceKind.findUniqueOrThrow({ where: { name: "part of" } });
    const subjectPreview = await previewChanges(agentId, { evidence: evidence(), edits: [{ op: "create", type: "Subject", fields: { name: "Notable show", subjectKindId: kind.id } }] });
    await applyChanges(agentId, subjectPreview.token as string);
    const subject = await db.subject.findFirstOrThrow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Reference", fields: { fromId: show.id, toId: subject.id, referenceKindId: partOf.id, note: "The first night." } }],
    });
    await applyChanges(agentId, preview.token as string);
    await db.changesetItem.updateMany({ data: { detail: Prisma.DbNull, label: null } });
    const [change] = (await listChangesets()).changes;
    expect(change.readout).toContain("Earlier change (no grouping stored)");
    expect(change.readout).toContain("New Reference: 1978-05-23 part of Notable show");
    expect(change.readout).toContain("note: “The first night.”");
    expect(change.readout).not.toMatch(new RegExp(`\\b${show.id}\\b`));
    expect(change.readout).not.toContain("deleted record");
    // A record that is gone reads as deleted, not as a bare number.
    await db.reference.deleteMany();
    await db.subject.deleteMany();
    const [later] = (await listChangesets()).changes;
    expect(later.readout).toContain(`(deleted record ${subject.id})`);
  });
});

describe("version check", () => {
  it("refuses an apply when the record changed after the preview, and shows both versions", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Early" } }],
    });
    // The curator edits the same record between the preview and the apply.
    await db.show.update({ where: { id: show.id }, data: { timeLabel: "Midnight", rev: { increment: 1 } } });
    const result = await applyChanges(agentId, preview.token as string);
    expect(result.ok).toBe(false);
    if (result.ok || result.reason !== "conflict") throw new Error("expected a conflict");
    expect(result.conflicts[0]).toMatchObject({ record: `Show ${show.id}`, expectedRev: show.rev });
    expect(result.conflicts[0].current).toMatchObject({ timeLabel: "Midnight" });
    expect(result.conflicts[0].proposed).toEqual({ timeLabel: "Early" });
    const text = formatApplyResult(result);
    expect(text).toContain("timeLabel: “Midnight”");
    expect(text).toContain("timeLabel: “Early”");
    expect((await db.show.findUniqueOrThrow({ where: { id: show.id } })).timeLabel).toBe("Midnight");
    expect(await db.changeset.count({ where: { status: "APPLIED" } })).toBe(1); // only the first make
  });

  it("warns at preview when the agent read an old version", async () => {
    const show = await makeShow();
    await db.show.update({ where: { id: show.id }, data: { rev: { increment: 1 } } });
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Early" } }],
    });
    expect(preview.token).toBeNull();
    expect(preview.warnings[0]).toContain("changed since you read it");
  });
});

describe("what an agent may not do", () => {
  const ownKnowledge = { ownKnowledge: true };

  it.each(["SetType", "User", "AgentToken", "Changeset", "ChangesetItem", "Entity", "Session", "Account"])("refuses to create a %s", async (type) => {
    await expect(previewChanges(agentId, { evidence: ownKnowledge, edits: [{ op: "create", type, fields: { name: "x" } }] })).rejects.toMatchObject({ code: "invalid_input" });
    expect(await db.user.count()).toBe(1);
  });

  it("refuses to change a list value or a user", async () => {
    const setType = await db.setType.findFirstOrThrow();
    await expect(
      previewChanges(agentId, { evidence: ownKnowledge, edits: [{ op: "update", type: "SetType", id: setType.id, rev: setType.rev, fields: { name: "Hacked" } }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      previewChanges(agentId, { evidence: ownKnowledge, edits: [{ op: "update", type: "User", id: 1, rev: 1, fields: { role: "ADMIN" } }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect((await db.setType.findUniqueOrThrow({ where: { id: setType.id } })).name).toBe(setType.name);
  });

  it("refuses system fields and unknown fields", async () => {
    for (const fields of [{ rev: 9 }, { id: 5 }, { legacyId: "x" }, { nonsense: 1 }]) {
      await expect(previewChanges(agentId, { evidence: ownKnowledge, edits: [{ op: "create", type: "Show", fields }] })).rejects.toMatchObject({ code: "invalid_input" });
    }
  });

  it("stops and names a list value that does not exist", async () => {
    const preview = await previewChanges(agentId, {
      evidence: ownKnowledge,
      edits: [
        { op: "create", type: "Show", ref: "s", fields: { dateYear: 1990 } },
        { op: "create", type: "Set", fields: { showId: { ref: "s" }, position: 1, setTypeId: 999999 } },
      ],
    });
    expect(preview.token).toBeNull();
    expect(preview.warnings[0]).toMatch(/SetType 999999 does not exist.*admin/);
    expect(await db.show.count()).toBe(0);
  });

  it("warns when a call is over the record limit", async () => {
    const edits = Array.from({ length: 51 }, (_, i) => ({ op: "create", type: "Show", fields: { dateYear: 1900 + i } }));
    const preview = await previewChanges(agentId, { evidence: ownKnowledge, edits });
    expect(preview.token).toBeNull();
    expect(preview.warnings[0]).toContain("limit is 50");
    expect(await db.show.count()).toBe(0);
  });

  it("rejects a bad ref and a second change to one record", async () => {
    await expect(
      previewChanges(agentId, { evidence: ownKnowledge, edits: [{ op: "create", type: "Set", fields: { showId: { ref: "nope" }, position: 1, setTypeId } }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    const show = await makeShow();
    const edit = { op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Late" } };
    await expect(previewChanges(agentId, { evidence: ownKnowledge, edits: [edit, edit] })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rejects an unknown evidence record and a call with no evidence", async () => {
    const edits = [{ op: "create", type: "Show", fields: { dateYear: 1990 } }];
    await expect(previewChanges(agentId, { evidence: { sourceId: 999999 }, edits })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(previewChanges(agentId, { evidence: {}, edits })).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("rolls back the whole apply when one edit fails", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Show", fields: { dateYear: 1991, slug: "dup" } },
        { op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Late" } },
      ],
    });
    // A unique slug gets taken before the apply.
    await db.show.update({ where: { id: show.id }, data: { slug: "dup" } });
    await expect(applyChanges(agentId, preview.token as string)).rejects.toMatchObject({ code: "conflict" });
    expect(await db.show.count()).toBe(1);
  });
});

describe("preview wording", () => {
  it("keeps a note's own public setting, in the preview and after the apply", async () => {
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "create", type: "Note", fields: { body: "A public note", isPublic: true } }],
    });
    expect(preview.items[0].after).toMatchObject({ isPublic: true });
    await applyChanges(agentId, preview.token as string);
    const note = await db.note.findFirstOrThrow();
    expect(note.isPublic).toBe(true);
    const change = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "Note", id: note.id, rev: note.rev, fields: { isPublic: false } }],
    });
    await applyChanges(agentId, change.token as string);
    expect((await db.note.findUniqueOrThrow({ where: { id: note.id } })).isPublic).toBe(false);
  });

  it("names linked records, names a changed record by its stored value, and leaves out new IDs", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [
        { op: "create", type: "Note", ref: "note", fields: { body: "Old words" } },
        { op: "create", type: "NoteAttachment", fields: { noteId: { ref: "note" }, entityId: show.id } },
      ],
    });
    const text = formatPreview(preview);
    expect(text).toContain("entity: Show 1978-05-23");
    expect(text).not.toContain("Old words");
    expect(text).toContain("New Private note");
    // The new note sits under the show with its attachment, not under a heading of its own.
    expect(text).toContain("\nShow 1978-05-23\n  New Private note");
    expect(text).toContain("  New NoteAttachment");
    expect(text).not.toMatch(/^Note "Old words"$/m);
    expect(text).not.toMatch(/#\d+/);
    expect(text).toContain("Listed in recent changes:");
    expect(text).not.toContain("Public mark");
    await applyChanges(agentId, preview.token as string);
    const note = await db.note.findFirstOrThrow();
    const edit = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "Note", id: note.id, rev: note.rev, fields: { body: "New words" } }],
    });
    // A private note is named by its number, never by the start of its body.
    expect(formatPreview(edit)).toContain(`Changed Private note #${note.id}`);
  });
});

describe("labels, defaults and position", () => {
  /** A show with one set, a work and three segments a, b, c in order. Returns their IDs. */
  async function setup() {
    const work = await db.entity.create({ data: { kind: "WORK" } });
    const workKindId = (await db.workKind.findFirstOrThrow()).id;
    await db.work.create({ data: { id: work.id, title: "Man Of Constant Sorrow", workKindId } });
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Show", ref: "show", fields: { dateYear: 2002, dateMonth: 4, dateDay: 30 } },
        { op: "create", type: "Set", ref: "set", fields: { showId: { ref: "show" }, position: 1, setTypeId } },
        { op: "create", type: "Segment", fields: { setId: { ref: "set" }, sortKey: "a1" } },
        { op: "create", type: "Segment", fields: { setId: { ref: "set" }, sortKey: "a2" } },
        { op: "create", type: "Segment", fields: { setId: { ref: "set" }, sortKey: "a3" } },
      ],
    });
    await applyChanges(agentId, preview.token as string);
    const segments = await db.segment.findMany({ orderBy: { sortKey: "asc" } });
    return { workId: work.id, setId: segments[0].setId, ids: segments.map((x) => x.id) };
  }

  async function orderAfter(edit: Record<string, unknown>, workId: number) {
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Segment", fields: { workId }, ...edit }],
    });
    expect(preview.warnings).toEqual([]);
    await applyChanges(agentId, preview.token as string);
    const rows = await db.segment.findMany({ orderBy: { sortKey: "asc" }, select: { id: true } });
    return { preview, order: rows.map((r) => r.id) };
  }

  it("previews a new segment inserted with before: with labels and no defaults", async () => {
    const { workId, ids } = await setup();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Segment", before: ids[1], fields: { workId } }],
    });
    expect(preview.warnings).toEqual([]);
    const text = formatPreview(preview);
    expect(text).toContain("New Segment: Man Of Constant Sorrow, 2002-04-30");
    expect(text).toContain("set: 2002-04-30, set 1");
    expect(text).toContain("work: Man Of Constant Sorrow");
    for (const word of ["joinsNext", "workCertainty", "cutAtStart", "cutAtEnd", "extent", "isPublic", "wordsPublic"]) {
      expect(text).not.toContain(word);
    }
    expect(await db.segment.count()).toBe(3);
  });

  it("does not say a new work attaches to its kind", async () => {
    const workKindId = (await db.workKind.findFirstOrThrow()).id;
    const preview = await previewChanges(agentId, { evidence: evidence(), edits: [{ op: "create", type: "Work", fields: { title: "Ripple", workKindId } }] });
    const text = formatPreview(preview);
    expect(text).toContain("work kind: song");
    expect(text).not.toContain("attaches to");
  });

  it("inserts first, in the middle and last in a set", async () => {
    const { workId, ids } = await setup();
    const [a, b, c] = ids;
    const first = await orderAfter({ before: a }, workId);
    expect(first.order.slice(1)).toEqual([a, b, c]);
    const [n1] = first.order;
    const middle = await orderAfter({ after: a }, workId);
    expect(middle.order[0]).toBe(n1);
    expect(middle.order.filter((id) => ![n1, a, b, c].includes(id))).toHaveLength(1);
    expect([middle.order[1], middle.order[3], middle.order[4]]).toEqual([a, b, c]);
    const last = await orderAfter({ after: c }, workId);
    expect(last.order.slice(0, 5)).toEqual(middle.order);
    expect(last.order).toHaveLength(6);
    const rows = await db.segment.findMany();
    expect(new Set(rows.map((x) => x.sortKey)).size).toBe(6);
    expect(new Set(rows.map((x) => x.setId)).size).toBe(1);
  });

  it("puts a new segment next to another new segment of the same call", async () => {
    const { workId, setId } = await setup();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [
        { op: "create", type: "Segment", ref: "x", fields: { setId, sortKey: "b0" } },
        { op: "create", type: "Segment", ref: "y", after: { ref: "x" }, fields: { workId } },
        { op: "create", type: "Segment", before: { ref: "y" }, fields: { workId } },
      ],
    });
    expect(preview.warnings).toEqual([]);
    await applyChanges(agentId, preview.token as string);
    const rows = await db.segment.findMany({ where: { sortKey: { gte: "b0" } }, orderBy: { sortKey: "asc" } });
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.workId)).toEqual([null, workId, workId]);
  });

  it("refuses a sortKey together with before, and a neighbour in another set", async () => {
    const { workId, ids } = await setup();
    await expect(
      previewChanges(agentId, { evidence: evidence(), edits: [{ op: "create", type: "Segment", before: ids[0], fields: { sortKey: "a0", workId } }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    await expect(
      previewChanges(agentId, { evidence: evidence(), edits: [{ op: "create", type: "Segment", before: ids[0], fields: { setId: ids[0] } }] }),
    ).rejects.toMatchObject({ code: "invalid_input" });
  });

  it("names segments and sets in apply results, get_record and search", async () => {
    const { workId, ids, setId } = await setup();
    const preview = await previewChanges(agentId, { evidence: evidence(), edits: [{ op: "create", type: "Segment", after: ids[2], fields: { workId } }] });
    const applied = formatApplyResult(await applyChanges(agentId, preview.token as string));
    expect(applied).toContain("created Segment: Man Of Constant Sorrow, 2002-04-30");
    expect(await getRecord("Segment", { id: ids[0] })).toMatchObject({ label: "Segment: [spoken], 2002-04-30" });
    expect(await getRecord("Set", { id: setId })).toMatchObject({ label: "Set: 2002-04-30, set 1" });
    const hits = await searchRecords({ type: "Work", query: "Constant" });
    expect(hits[0].label).toBe('Work "Man Of Constant Sorrow"');
    const [change] = (await listChangesets()).changes;
    expect(change.items[0].label).toBe("Segment: Man Of Constant Sorrow, 2002-04-30");
  });
});

describe("read and search", () => {
  it("reads a show with its sets and segments in order", async () => {
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [
        { op: "create", type: "Show", ref: "show", fields: { dateYear: 1980 } },
        { op: "create", type: "Set", ref: "s2", fields: { showId: { ref: "show" }, position: 2, setTypeId } },
        { op: "create", type: "Set", ref: "s1", fields: { showId: { ref: "show" }, position: 1, setTypeId } },
        { op: "create", type: "Segment", fields: { setId: { ref: "s1" }, sortKey: "b" } },
        { op: "create", type: "Segment", fields: { setId: { ref: "s1" }, sortKey: "a" } },
      ],
    });
    await applyChanges(agentId, preview.token as string);
    const show = await db.show.findFirstOrThrow();
    const record = (await getRecord("Show", { id: show.id })) as { sets: Array<{ position: number; segments: Array<{ sortKey: string }> }> };
    expect(record.sets.map((x) => x.position)).toEqual([1, 2]);
    expect(record.sets[0].segments.map((x) => x.sortKey)).toEqual(["a", "b"]);
  });

  it("lists the evidence of every change to a record, newest first", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Late" } }],
    });
    await applyChanges(agentId, preview.token as string);
    const record = await getRecord("Show", { id: show.id });
    const from = record.whereThisCameFrom as Array<{ action: string; evidence: string }>;
    expect(from.map((c) => c.action)).toEqual(["changed", "created"]);
    expect(from[0].evidence).toBe("own knowledge");
    expect(from[1].evidence).toContain("page 4");
  });

  it("still creates a deliberate citation", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Citation", fields: { entityId: show.id, sourceId, place: "page 9", excerpt: "Ad for the show" } }],
    });
    expect(preview.warnings).toEqual([]);
    await applyChanges(agentId, preview.token as string);
    expect(await db.citation.findMany({ where: { entityId: show.id } })).toEqual([expect.objectContaining({ place: "page 9", excerpt: "Ad for the show" })]);
    const record = await getRecord("Show", { id: show.id });
    expect((record.attachments as { citations: unknown[] }).citations).toHaveLength(1);
  });

  it("finds a show by date and place and reads it with its citations", async () => {
    const place = await db.entity.create({ data: { kind: "PLACE" } });
    await db.place.create({ data: { id: place.id, slug: "keystone" } });
    const name = await db.entity.create({ data: { kind: "PLACE_NAME" } });
    await db.placeName.create({ data: { id: name.id, placeId: place.id, name: "Keystone Berkeley", position: 1 } });
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Show", fields: { dateYear: 1978, dateMonth: 5, dateDay: 23, placeId: place.id, placeNameId: name.id } }],
    });
    await applyChanges(agentId, preview.token as string);
    const hits = await searchRecords({ type: "Show", date: "1978-05", place: "keystone" });
    expect(hits).toHaveLength(1);
    expect(hits[0].label).toBe("Show 1978-05-23, Keystone Berkeley");
    const record = await getRecord("Show", { id: hits[0].id as number });
    expect(record).toMatchObject({ dateYear: 1978, isPublic: true });
    expect((record.attachments as { citations: unknown[] }).citations).toHaveLength(0);
    expect(record.whereThisCameFrom).toEqual([
      expect.objectContaining({ action: "created", user: "agent@example.test", evidence: expect.stringContaining('source "Synthetic notebook'), changesetId: expect.any(Number) }),
    ]);
    await expect(getRecord("User", { id: 1 })).rejects.toMatchObject({ code: "invalid_input" });
    await expect(searchRecords({ type: "Session", query: "x" })).rejects.toMatchObject({ code: "invalid_input" });
  });
});

describe("sources without a Zotero link (item 108)", () => {
  async function makeUnlinked() {
    const kind = await db.sourceKind.findFirstOrThrow({ where: { name: "article" } });
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Source", fields: { title: "Synthetic interview", key: "synthetic-interview", sourceKindId: kind.id, otherNames: ["the interview"] } }],
    });
    expect(preview.warnings).toEqual([]);
    expect(await db.source.count({ where: { key: "synthetic-interview" } })).toBe(0);
    await applyChanges(agentId, preview.token as string);
    return db.source.findFirstOrThrow({ where: { key: "synthetic-interview" } });
  }

  it("has the album and article source kinds", async () => {
    const names = (await db.sourceKind.findMany()).map((k) => k.name);
    expect(names).toEqual(expect.arrayContaining(["album", "article"]));
  });

  it("creates a source with no Zotero key through preview and apply", async () => {
    const source = await makeUnlinked();
    expect(source).toMatchObject({ zoteroKey: null, zoteroData: null, syncedAt: null, title: "Synthetic interview" });
  });

  it("stores the other names on create and on update", async () => {
    const source = await makeUnlinked();
    expect(source.otherNames).toEqual(["the interview"]);
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Source", id: source.id, rev: source.rev, fields: { otherNames: ["the interview", "radio talk"] } }],
    });
    await applyChanges(agentId, preview.token as string);
    const after = await db.source.findUniqueOrThrow({ where: { id: source.id } });
    expect(after.otherNames).toEqual(["the interview", "radio talk"]);
    expect(after.rev).toBe(source.rev + 1);
  });

  it("changes the title of an unlinked source", async () => {
    const source = await makeUnlinked();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Source", id: source.id, rev: source.rev, fields: { title: "Renamed interview" } }],
    });
    await applyChanges(agentId, preview.token as string);
    expect((await db.source.findUniqueOrThrow({ where: { id: source.id } })).title).toBe("Renamed interview");
  });

  it("refuses to change the title of a linked source", async () => {
    const linked = await db.source.findUniqueOrThrow({ where: { id: sourceId } });
    await expect(
      previewChanges(agentId, {
        evidence: evidence(),
        edits: [{ op: "update", type: "Source", id: linked.id, rev: linked.rev, fields: { title: "New title" } }],
      }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    // Other fields of a linked source stay editable.
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Source", id: linked.id, rev: linked.rev, fields: { otherNames: ["notebook"] } }],
    });
    expect(preview.token).toMatch(/^suprev_/);
  });

  it("refuses a title change that applies after the source was linked", async () => {
    const source = await makeUnlinked();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "update", type: "Source", id: source.id, rev: source.rev, fields: { title: "Late rename" } }],
    });
    await db.source.update({ where: { id: source.id }, data: { zoteroKey: "ZK2", zoteroData: {}, syncedAt: new Date() } });
    await expect(applyChanges(agentId, preview.token as string)).rejects.toMatchObject({ code: "invalid_input" });
    expect((await db.source.findUniqueOrThrow({ where: { id: source.id } })).title).toBe("Synthetic interview");
  });

  it("allows many unlinked sources (a unique key allows many nulls)", async () => {
    await makeUnlinked();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Source", fields: { title: "Second", key: "second" } }],
    });
    await applyChanges(agentId, preview.token as string);
    expect(await db.source.count({ where: { zoteroKey: null } })).toBe(2);
  });
});
