import { describe, expect, it } from "vitest";
import { countsSentence, formatReadout, storedReadoutItem, type LinkInfo, type ParentInfo, type ReadoutItem } from "@/lib/changes/readout";

const show: ParentInfo = { key: "Show:1", type: "Show", label: "Show 1980-11-14, WHFS-FM Studio" };
const link = (type: string, name: string, isNew = false): LinkInfo => ({ type, label: type === "Set" ? name : `${type} "${name}"`, name, isNew });
const none = { before: {}, after: {} };

function create(type: string, label: string, after: Record<string, unknown>, parent: ParentInfo | null, links: Record<string, LinkInfo> = {}): ReadoutItem {
  return { op: "create", type, label, before: null, after, links: { before: {}, after: links }, parent };
}

/** A mixed changeset: new segments and references under one show, a new work, an overwrite. */
function mixed(): ReadoutItem[] {
  return [
    create("Segment", "Hunter talks about Terrapin Station, 1980-11-14", { id: 11, setId: 5, sortKey: "a1", delivery: "SPOKEN", summary: "Hunter talks about Terrapin Station.", isPublic: true, wordsPublic: false }, show, { setId: link("Set", "1980-11-14, set 1") }),
    create("Segment", "Ripple, 1980-11-14", { id: 12, setId: 5, sortKey: "a2", workId: 7, workCertainty: "POSSIBLE", isPublic: false }, show, { workId: link("Work", "Ripple") }),
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

describe("countsSentence", () => {
  it("counts what was added, to which parents, what changed and what is new", () => {
    expect(countsSentence(mixed())).toBe(
      "Added 2 segments, 1 reference, 1 bill entry, 1 person and 1 note to 1 show; Changed 1 show; 1 is a new person, place, work, band, subject or source.",
    );
  });
  it("says so when there is nothing", () => {
    expect(countsSentence([])).toBe("No changes.");
  });
  it("leaves out the parent when the parent is new too", () => {
    const items = [create("Show", "Show 1980", { id: 1, dateYear: 1980 }, show), create("Set", "Set", { id: 2, showId: 1, position: 1 }, show)];
    expect(countsSentence(items)).toBe("Added 1 show and 1 set.");
  });
});

describe("formatReadout", () => {
  const text = formatReadout(mixed());
  const lines = text.split("\n");

  it("puts the counts first, then the unusual lines, then the groups", () => {
    expect(lines[0]).toBe(countsSentence(mixed()));
    expect(lines.indexOf("Look at these first:")).toBeLessThan(lines.indexOf("Show 1980-11-14, WHFS-FM Studio"));
  });
  it("lists the unusual lines: new people, overwritten values, certainty below confirmed", () => {
    const unusual = lines.slice(lines.indexOf("Look at these first:") + 1, lines.indexOf("Show 1980-11-14, WHFS-FM Studio") - 1);
    expect(unusual).toContain("- New person: Walter Scott");
    expect(unusual.some((l) => l.startsWith("- Changed value in Show 1980-11-14") && l.includes('time label: "Early" → "Late"'))).toBe(true);
    expect(unusual.some((l) => l.includes("Not confirmed") && l.includes("work certainty: possible"))).toBe(true);
    expect(unusual.some((l) => l.includes("Not confirmed") && l.includes("certainty: probable"))).toBe(true);
    // A value that was only filled in is not unusual.
    expect(unusual.join("\n")).not.toContain("notes");
  });
  it("groups the records under one heading per parent, with one line each", () => {
    expect(lines.filter((l) => l === "Show 1980-11-14, WHFS-FM Studio")).toHaveLength(1);
    expect(text).toContain('Person "Walter Scott"\n- New Person "Walter Scott"\n');
    expect(text).toContain("- New Reference: Hunter talks about Terrapin Station, 1980-11-14 mentions Terrapin Station");
    expect(text).toContain("- New Bill: Roadhog (headliner)");
  });
  it("words who can see each record and shows no raw flags or system fields", () => {
    expect(text).toContain("public: summary and references · words: private");
    expect(text).toContain("not public");
    expect(text).toContain("private note");
    for (const raw of ["isPublic", "wordsPublic", "sortKey", "rev", "setId: 5"]) expect(text).not.toContain(raw);
    expect(text).not.toContain("true");
  });
  it("shows a link with its ID and name, and no default value", () => {
    expect(text).toContain("work: 7 (Ripple)");
    expect(text).not.toContain("joinsNext");
    expect(text).not.toContain("cut at");
  });
  it("shows a change of who can see a record in words", () => {
    const item: ReadoutItem = {
      op: "update", type: "Segment", label: "Ripple, 1980", links: none, parent: null,
      before: { id: 1, isPublic: true, wordsPublic: false }, after: { id: 1, isPublic: true, wordsPublic: true },
    };
    expect(formatReadout([item])).toContain("who can see it: public: summary and references · words: private → public: summary and references · words: public");
  });
  it("shows public text in full and cuts long private text", () => {
    const long = "x".repeat(500);
    const read = (type: string, after: Record<string, unknown>) => formatReadout([create(type, type, { id: 1, ...after }, null)]);
    expect(read("Note", { body: long, isPublic: true })).toContain(long);
    expect(read("Note", { body: long, isPublic: false })).not.toContain(long);
    expect(read("Segment", { summary: long })).toContain(long);
    expect(read("Segment", { wordsAsHeard: long })).not.toContain(long);
  });
  it("shows a link to a record made in the same call as new", () => {
    const item = create("NoteAttachment", "NoteAttachment", { id: 2, noteId: 9 }, null, { noteId: link("Note", "Great show", true) });
    expect(formatReadout([item])).toContain('note: (new) Note "Great show"');
  });
  it("caps a long unusual list", () => {
    const many = Array.from({ length: 40 }, (_, i) => create("Person", `Person "P${i}"`, { id: 100 + i, name: `P${i}` }, null));
    const read = formatReadout(many).split("\n");
    expect(read.filter((l) => l.startsWith("- New person"))).toHaveLength(25);
    expect(read.some((l) => l.startsWith("- ...and 15 more"))).toBe(true);
  });
});

describe("storedReadoutItem", () => {
  it("builds the same text from a stored item as from the preview item", () => {
    const [item] = mixed();
    const stored = storedReadoutItem({ type: item.type, label: item.label, action: "CREATE", before: null, after: item.after, detail: { links: item.links, parent: item.parent } });
    expect(formatReadout([stored])).toBe(formatReadout([item]));
  });
  it("reads an old item with no detail without links", () => {
    const stored = storedReadoutItem({ type: "Segment", label: "Ripple", action: "CREATE", before: null, after: { id: 1, workId: 7 }, detail: null });
    expect(formatReadout([stored])).toContain("work: 7");
  });
});
