import { describe, expect, it } from "vitest";
import { buildReadout, countsSentence, formatReadout, storedReadoutItem, type LinkInfo, type ParentInfo, type ReadoutItem } from "@/lib/changes/readout";

const show: ParentInfo = { key: "Show:1", type: "Show", label: "Show 1980-11-14, WHFS-FM Studio" };
const link = (type: string, name: string, isNew = false): LinkInfo => ({ type, label: type === "Set" ? name : `${type} "${name}"`, name, isNew });
const none = { before: {}, after: {} };
const HEADING = "Show 1980-11-14, WHFS-FM Studio";

function create(type: string, label: string, after: Record<string, unknown>, parent: ParentInfo | null, links: Record<string, LinkInfo> = {}): ReadoutItem {
  return { op: "create", type, label, before: null, after, links: { before: {}, after: links }, parent };
}

/** A mixed changeset: new segments and references under one show, a new work, an overwrite. */
function mixed(): ReadoutItem[] {
  return [
    create("Segment", "Hunter talks about Terrapin Station, 1980-11-14", { id: 11, setId: 5, sortKey: "a1", delivery: "SPOKEN", summary: "Hunter talks about Terrapin Station.", isPublic: true, wordsPublic: false }, show, { setId: link("Set", "1980-11-14, set 1") }),
    create("Segment", "Ripple, 1980-11-14", { id: 12, setId: 5, sortKey: "a2", workId: 7, workCertainty: "POSSIBLE", isPublic: false }, show, { setId: link("Set", "1980-11-14, set 1"), workId: link("Work", "Ripple") }),
    create("Reference", "Reference", { id: 21, fromId: 11, toId: 8, referenceKindId: 4, certainty: "PROBABLE" }, show, {
      fromId: link("Segment", "Hunter talks about Terrapin Station, 1980-11-14"),
      toId: link("Work", "Terrapin Station"),
      referenceKindId: link("ReferenceKind", "mentions"),
    }),
    create("BillEntry", "BillEntry", { id: 22, showId: 1, actBandId: 3, role: "HEADLINER", position: 1 }, show, { actBandId: link("Band", "Roadhog"), showId: link("Show", "1980-11-14") }),
    create("Person", "Person \"Walter Scott\"", { id: 30, name: "Walter Scott" }, { key: "Person:30", type: "Person", label: "Person \"Walter Scott\"" }),
    create("Note", "Note \"Check the tape\"", { id: 40, body: "Check the tape", isPublic: false }, null),
    {
      op: "update", type: "Show", label: "Show 1980-11-14, WHFS-FM Studio",
      before: { id: 1, rev: 1, timeLabel: "Early", notes: null },
      after: { id: 1, rev: 2, timeLabel: "Late", notes: "Aired live." },
      links: none, parent: show,
    },
  ];
}

function update(type: string, label: string, before: Record<string, unknown>, after: Record<string, unknown>, links = none): ReadoutItem {
  return { op: "update", type, label, before: { id: 1, ...before }, after: { id: 1, ...after }, links, parent: null };
}

describe("countsSentence", () => {
  it("counts what was added, to which parents, what changed and what is new", () => {
    expect(countsSentence(mixed())).toBe("Added 2 segments, 1 reference, 1 bill entry, 1 person and 1 note to 1 show; changed 1 show; 1 new record.");
  });
  it("says so when there is nothing", () => {
    expect(countsSentence([])).toBe("No changes.");
  });
  it("leaves out the parent when the parent is new too", () => {
    const items = [create("Show", "Show 1980", { id: 1, dateYear: 1980 }, show), create("Set", "Set", { id: 2, showId: 1, position: 1 }, show)];
    expect(countsSentence(items)).toBe("Added 1 show and 1 set.");
  });
  it("reads well for one subject, one reference and one change", () => {
    const items = [
      create("Subject", "Subject \"Harp\"", { id: 3, name: "Harp" }, show),
      create("Reference", "Reference", { id: 4 }, show),
      update("Segment", "Ripple", { notes: "a" }, { notes: "b" }),
    ];
    expect(countsSentence(items)).toBe("Added 1 subject and 1 reference to 1 show; changed 1 segment; 1 new record.");
  });
  it("counts many new records in the plural", () => {
    const items = [1, 2].map((id) => create("Person", `Person "P${id}"`, { id, name: `P${id}` }, null));
    expect(countsSentence(items)).toBe("Added 2 people; 2 new records.");
  });
});

describe("formatReadout", () => {
  const text = formatReadout(mixed());
  const lines = text.split("\n");
  const unusualEnd = lines.indexOf(HEADING) - 1;

  it("puts the counts first, then the unusual lines, then the groups", () => {
    expect(lines[0]).toBe(countsSentence(mixed()));
    expect(lines.indexOf("Look at these first:")).toBeLessThan(lines.indexOf(HEADING));
  });
  it("lists the unusual lines: new people, overwritten values, certainty below confirmed", () => {
    const unusual = lines.slice(lines.indexOf("Look at these first:") + 1, unusualEnd).join("\n");
    expect(unusual).toContain("- New person: Walter Scott");
    expect(unusual).toContain("- Changed value in Show 1980-11-14");
    expect(unusual).toContain("was: “Early”");
    expect(unusual).toContain("now: “Late”");
    expect(unusual).toContain("work certainty: possible");
    expect(unusual).toContain("certainty: probable");
    // A value that was only filled in is not unusual.
    expect(unusual).not.toContain("notes");
  });
  it("says which record a not-confirmed line is about", () => {
    expect(text).toContain("- Not confirmed: Hunter talks about Terrapin Station, 1980-11-14 mentions Terrapin Station · certainty: probable");
    expect(text).toContain("- Not confirmed: Segment: Ripple, 1980-11-14 · work certainty: possible");
  });
  it("groups the records under one heading per parent, with each field on its own line", () => {
    expect(lines.filter((l) => l === HEADING)).toHaveLength(1);
    expect(text).toContain('Person "Walter Scott"\n  New Person "Walter Scott"\n');
    expect(text).toContain("  New Reference: Hunter talks about Terrapin Station, 1980-11-14 mentions Terrapin Station\n    certainty: probable");
    expect(text).toContain("  New Bill: Roadhog (headliner)\n");
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThan(160);
  });
  it("words who can see each record and shows no raw flags or system fields", () => {
    expect(text).toContain("who can see it: public: summary and references · words: private");
    expect(text).toContain("who can see it: not public");
    expect(text).toContain("who can see it: private note");
    for (const raw of ["isPublic", "wordsPublic", "sortKey", "rev", "setId: 5"]) expect(text).not.toContain(raw);
    expect(text).not.toContain("true");
  });
  it("shows a link by its name, with no ID, and no default value", () => {
    expect(text).toContain("work: Ripple");
    expect(text).not.toContain("7 (Ripple)");
    expect(text).not.toContain("joinsNext");
    expect(text).not.toContain("cut at");
  });
  it("shows a change of who can see a record in words", () => {
    const item = update("Segment", "Ripple, 1980", { isPublic: true, wordsPublic: false }, { isPublic: true, wordsPublic: true });
    expect(formatReadout([item])).toContain("who can see it: public: summary and references · words: private → public: summary and references · words: public");
  });
  it("treats a missing public flag as unknown, not as public", () => {
    const item = create("Segment", "Ripple", { id: 1, summary: "x" }, null);
    expect(formatReadout([item])).not.toContain("who can see it");
  });
  it("cuts long text at about 100 characters with one cut mark, private text too", () => {
    const long = "x".repeat(500);
    const read = (type: string, after: Record<string, unknown>) => formatReadout([create(type, type, { id: 1, ...after }, null)]);
    expect(read("Note", { body: long, isPublic: true })).not.toContain(long);
    expect(read("Note", { body: long, isPublic: false })).not.toContain(long);
    expect(read("Segment", { wordsAsHeard: long })).toContain("words as heard (private): “" + "x".repeat(99) + "…”");
    const summary = read("Segment", { summary: "y".repeat(300) });
    expect(summary).toContain("“" + "y".repeat(99) + "…”");
    expect(summary).not.toContain("y".repeat(101));
    expect(summary).not.toContain("...");
  });
  it("shows private text of a new record, marked private", () => {
    const read = (type: string, after: Record<string, unknown>) => formatReadout([create(type, type, { id: 1, ...after }, null)]);
    expect(read("Note", { body: "Ask Bob about the tape.", isPublic: false })).toContain("body (private): “Ask Bob about the tape.”");
    expect(read("Citation", { excerpt: "He said the secret thing" })).toContain("excerpt (private): “He said the secret thing”");
    expect(read("Segment", { wordsAsHeard: "la la la" })).toContain("words as heard (private): “la la la”");
    expect(read("Rendition", { wording: "sung words" })).toContain("wording (private): “sung words”");
    expect(read("Person", { name: "Bob", email: "bob@example.test" })).toContain("email (private): “bob@example.test”");
    expect(read("Note", { body: "Public words", isPublic: true })).not.toContain("(private)");
  });
  it("titles a private note by the start of its body, marked private", () => {
    const item = create("Note", 'Note "Ask Bob about the tape" (private)', { id: 12, body: "Ask Bob about the tape", isPublic: false }, null);
    const text = formatReadout([item]);
    expect(text).toContain('New Note "Ask Bob about the tape" (private)');
    expect(text).not.toContain("Private note");
  });
  it("shows a link to a record made in the same call as new", () => {
    const item = create("NoteAttachment", "NoteAttachment", { id: 2, noteId: 9 }, null, { noteId: link("Note", "Great show", true) });
    expect(formatReadout([item])).toContain('note: (new) Note "Great show"');
  });
  it("caps a long unusual list", () => {
    const many = Array.from({ length: 40 }, (_, i) => create("Person", `Person "P${i}"`, { id: 100 + i, name: `P${i}` }, null));
    const read = formatReadout(many).split("\n");
    expect(read.filter((l) => l.startsWith("- New person"))).toHaveLength(25);
    expect(read.some((l) => l.startsWith("- …and 15 more"))).toBe(true);
  });
});

describe("changed fields", () => {
  it("shows a changed text field as was and now, cut at about 100 characters", () => {
    const was = `Jack O' Roses was a hobbyist record for England. ${"a".repeat(200)}`;
    const item = update("Segment", "Ripple", { summary: was }, { summary: "Jack O' Roses was a record made in England" });
    const text = formatReadout([item]);
    expect(text).toContain("    summary\n      was: “Jack O' Roses was a hobbyist record for England. ");
    expect(text).toContain("      now: “Jack O' Roses was a record made in England”");
    expect(Math.max(...text.split("\n").map((l) => l.length))).toBeLessThan(140);
  });
  it("shows a private text update as was and now, cut, marked private", () => {
    const item = update("Segment", "Ripple", { wordsAsHeard: "a".repeat(412) }, { wordsAsHeard: "b".repeat(196) });
    const text = formatReadout([item]);
    expect(text).toContain("words as heard (private)\n      was: “" + "a".repeat(99) + "…”\n      now: “" + "b".repeat(99) + "…”");
  });
  it("shows a short private change as a diff marked private", () => {
    const item = update("Citation", "Citation", { excerpt: "old words" }, { excerpt: "new words" });
    const text = formatReadout([item]);
    expect(text).toContain("excerpt (private)");
    expect(text).toContain("was: “old words”");
  });
  it("shows a moved link in names", () => {
    const item: ReadoutItem = {
      op: "update", type: "Reference", label: "Reference", parent: null,
      before: { id: 5, fromId: 13929, toId: 8, referenceKindId: 4 },
      after: { id: 5, fromId: 14222, toId: 8, referenceKindId: 4 },
      links: {
        before: { fromId: link("Segment", "Jack O' Roses was a hobbyist record…"), toId: link("Work", "Ripple"), referenceKindId: link("ReferenceKind", "mentions") },
        after: { fromId: link("Segment", "Made for an English audience…"), toId: link("Work", "Ripple"), referenceKindId: link("ReferenceKind", "mentions") },
      },
    };
    const text = formatReadout([item]);
    expect(text).toContain("Moved Reference: Made for an English audience… mentions Ripple");
    expect(text).toContain("from: Segment \"Jack O' Roses was a hobbyist record…\" → Segment \"Made for an English audience…\"");
    expect(text).not.toContain("13929");
    expect(text).not.toContain("14222");
  });
  it("prints an ID only when there is no name: deleted record, or name not found", () => {
    const gone: LinkInfo = { type: "Segment", label: "", name: "", isNew: false, deleted: true };
    const deleted = create("Reference", "Reference", { id: 5, fromId: 14180, certainty: "PROBABLE" }, null, { fromId: gone });
    expect(formatReadout([deleted])).toContain("from: (deleted record 14180)");
    const unknown = create("Reference", "Reference", { id: 5, fromId: 14180, certainty: "PROBABLE" }, null);
    expect(formatReadout([unknown])).toContain("from: (record 14180, name not found)");
    expect(formatReadout([unknown])).not.toContain("deleted");
  });
  it("says Moved only for a change of parent or order, and Changed for a new work", () => {
    const base = { op: "update" as const, type: "Segment", label: "Ripple", parent: null, links: none };
    const work = formatReadout([{ ...base, before: { id: 1, workId: 7 }, after: { id: 1, workId: 8 } }]);
    expect(work).toContain("Changed Segment");
    expect(work).not.toContain("Moved");
    expect(formatReadout([{ ...base, before: { id: 1, setId: 5 }, after: { id: 1, setId: 6 } }])).toContain("Moved Segment");
    expect(formatReadout([{ ...base, before: { id: 1, sortKey: "a" }, after: { id: 1, sortKey: "b" } }])).toContain("Moved Segment");
  });
  it("says Moved for a segment placed under another segment", () => {
    const base = { op: "update" as const, type: "Segment", label: "Ripple", parent: null, links: none };
    expect(formatReadout([{ ...base, before: { id: 1, parentId: 3 }, after: { id: 1, parentId: 4 } }])).toContain("Moved Segment");
  });
  it("says Changed, not Moved, when the credited version of a credit changes", () => {
    const base = { op: "update" as const, type: "Credit", label: "Credit", parent: null, links: none };
    const text = formatReadout([{ ...base, before: { id: 1, versionId: 3 }, after: { id: 1, versionId: 4 } }]);
    expect(text).toContain("Changed Credit");
    expect(text).not.toContain("Moved");
  });
  it("shows a short changed value on two lines", () => {
    const item = update("Show", "Show 1980", { timeLabel: "Early" }, { timeLabel: "Late" });
    expect(formatReadout([item])).toContain("  time label\n      was: “Early”\n      now: “Late”");
  });
  it("prints no backslash before a quote inside a value", () => {
    const item = update("Show", "Show 1980", { notes: "He said hi." }, { notes: 'He said "hello" to the host.' });
    const text = formatReadout([item]);
    expect(text).toContain("“He said \"hello\" to the host.”");
    expect(text).not.toContain("\\");
  });
  it("lists the not-confirmed fields in the model order, whatever the order of the stored keys", () => {
    const a = create("Segment", "Ripple", { id: 1, wordsFromCertainty: "PROBABLE", tuneFromCertainty: "POSSIBLE" }, null);
    const b = create("Segment", "Ripple", { id: 1, tuneFromCertainty: "POSSIBLE", wordsFromCertainty: "PROBABLE" }, null);
    expect(formatReadout([a])).toBe(formatReadout([b]));
  });
});

describe("storedReadoutItem", () => {
  it("builds the same text from a stored item as from the preview item", () => {
    const [item] = mixed();
    const stored = storedReadoutItem({ type: item.type, label: item.label, action: "CREATE", before: null, after: item.after, detail: { links: item.links, parent: item.parent } });
    expect(formatReadout([stored])).toBe(formatReadout([item]));
  });
  it("builds the same text when the stored row has its keys in another order", () => {
    const item = create("Segment", "Ripple", { id: 1, wordsFromCertainty: "PROBABLE", tuneFromCertainty: "POSSIBLE", summary: "x" }, show);
    const reordered = { summary: "x", tuneFromCertainty: "POSSIBLE", wordsFromCertainty: "PROBABLE", id: 1 };
    const stored = storedReadoutItem({ type: "Segment", label: "Ripple", action: "CREATE", before: null, after: reordered, detail: { links: item.links, parent: show } });
    expect(formatReadout([stored])).toBe(formatReadout([item]));
  });
  it("puts items with no stored grouping under one heading, with no bare IDs", () => {
    const old = (id: number) => storedReadoutItem({ type: "Reference", label: "Reference", action: "CREATE", before: null, after: { id, fromId: 13928, toId: 14180, referenceKindId: 4, note: 'Says: "import record"' }, detail: null });
    const readout = buildReadout([old(1), old(2)]);
    expect(readout.groups).toHaveLength(1);
    expect(readout.groups[0].heading).toBe("Earlier change (no grouping stored)");
    expect(readout.groups[0].cards).toHaveLength(2);
    const text = formatReadout([old(1)]);
    expect(text).toContain("(record 13928, name not found)");
    expect(text).not.toMatch(/: \d+( →|$)/m);
    expect(text).not.toContain("to Earlier");
  });
  it("reads an old item with names that the page looked up", () => {
    const stored = storedReadoutItem({
      type: "Reference", label: "Reference #14197", action: "CREATE", before: null,
      after: { id: 14197, fromId: 13928, toId: 14180, referenceKindId: 4, note: 'Says: "import record"' },
      detail: {
        parent: null,
        links: { before: {}, after: { fromId: link("Segment", "The host has an import copy of Jack O' Roses, 1980-11-14"), toId: link("Source", "Jack O' Roses"), referenceKindId: link("ReferenceKind", "mentions") } },
      },
    });
    const text = formatReadout([stored]);
    expect(text).toContain("The host has an import copy of Jack O' Roses, 1980-11-14 mentions Jack O' Roses");
    expect(text).toContain("note: “Says: \"import record\"”");
    expect(text).not.toContain("13928");
  });
  it("reads a delete as a delete", () => {
    const stored = storedReadoutItem({ type: "Note", label: "Note \"x\"", action: "DELETE", before: { id: 1, body: "x", isPublic: true }, after: null, detail: null });
    const text = formatReadout([stored]);
    expect(text).toContain("Look at these first:");
    expect(text).toContain("Deleted · Note");
    expect(text).toContain("who can see it: public note");
    expect(text).not.toContain("Changed");
  });
});
