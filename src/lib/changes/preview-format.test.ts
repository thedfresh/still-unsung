import { describe, expect, it } from "vitest";
import { describeRecord, filledFields, segmentLabel, setLabel, withType } from "@/lib/changes/labels";
import { formatPreview } from "@/lib/changes/preview-format";

describe("describeRecord", () => {
  it("names a show by date and place", () => {
    expect(describeRecord("Show", { dateYear: 1978, dateMonth: 5, dateDay: 23 }, "Keystone")).toBe("Show 1978-05-23, Keystone");
  });
  it("keeps a partial date partial", () => {
    expect(describeRecord("Show", { dateYear: 1978 })).toBe("Show 1978");
  });
  it("falls back to a name field, then the ID", () => {
    expect(describeRecord("Work", { id: 4, title: "Ripple" })).toBe('Work "Ripple"');
    expect(describeRecord("Set", { id: 9 })).toBe("Set #9");
  });
});

describe("segment and set labels", () => {
  it("names a segment by its work and the date of its show", () => {
    expect(segmentLabel("Man Of Constant Sorrow", "2002-04-30")).toBe("Man Of Constant Sorrow, 2002-04-30");
    expect(segmentLabel(null, "2002-04-30")).toBe("[spoken], 2002-04-30");
  });
  it("names a set by its show and position", () => {
    expect(setLabel({ position: 1 }, "2002-08-07")).toBe("2002-08-07, set 1");
    expect(setLabel({ id: 4 }, "2002-08-07")).toBeNull();
  });
  it("adds the type unless the label has it", () => {
    expect(withType("Segment", "Ripple, 1978")).toBe("Segment: Ripple, 1978");
    expect(withType("Show", "Show 1978-05-23")).toBe("Show 1978-05-23");
  });
});

describe("filledFields", () => {
  it("leaves out empty values and column defaults", () => {
    const after = { id: 1, rev: 1, setId: 5, sortKey: "a1", joinsNext: "STOPS", workCertainty: "CONFIRMED", cutAtStart: false, delivery: null, extent: "PARTIAL", cutAtEnd: true };
    expect(filledFields("Segment", after).map(([name]) => name)).toEqual(["setId", "sortKey", "extent", "cutAtEnd"]);
  });
  it("leaves out an empty list default", () => {
    expect(filledFields("Work", { title: "Ripple", otherNames: [] }).map(([name]) => name)).toEqual(["title"]);
    expect(filledFields("Work", { title: "Ripple", otherNames: ["Rip"] }).map(([name]) => name)).toEqual(["title", "otherNames"]);
  });
});

describe("formatPreview", () => {
  const base = { evidence: "own knowledge", citedLabels: [], isPublic: false, warnings: [], expiresAt: null, token: null };
  it("shows a change as before → after", () => {
    const text = formatPreview({
      ...base,
      items: [{ op: "update", type: "Show", label: "Show 1978-05-23, Keystone", before: { id: 1, rev: 1, timeLabel: null }, after: { id: 1, rev: 2, timeLabel: "Late" }, attachesTo: [], links: { before: {}, after: {} } }],
    });
    expect(text).toContain("CHANGE Show 1978-05-23, Keystone");
    expect(text).toContain('timeLabel: (empty) → "Late"');
    expect(text).not.toContain("rev:");
  });
  it("shows a new record with its fields and where it attaches", () => {
    const text = formatPreview({
      ...base,
      items: [{ op: "create", type: "Set", label: "Set #3", before: null, after: { id: 3, position: 1, showId: 7, notes: null }, attachesTo: ["Show 1978"], links: { before: {}, after: { showId: "Show 1978" } } }],
    });
    expect(text).toContain("NEW Set #3");
    expect(text).toContain("position: 1");
    expect(text).not.toContain("notes");
    expect(text).toContain("attaches to: Show 1978");
  });
  it("labels the recording-played delivery in plain words", () => {
    const text = formatPreview({
      ...base,
      items: [{ op: "create", type: "Segment", label: "Segment", before: null, after: { id: 1, delivery: "RECORDING_PLAYED" }, attachesTo: [], links: { before: {}, after: {} } }],
    });
    expect(text).toContain("delivery: recording played");
  });
  it("shows no default values for a new segment", () => {
    const text = formatPreview({
      ...base,
      items: [{ op: "create", type: "Segment", label: "Man Of Constant Sorrow, 2002-04-30", before: null, after: { id: 1, setId: 2, sortKey: "a5", workId: 3, joinsNext: "STOPS", workCertainty: "CONFIRMED", cutAtStart: false, extent: "COMPLETE" }, attachesTo: [], links: { before: {}, after: { setId: "2002-04-30, set 1", workId: 'Work "Man Of Constant Sorrow"' } } }],
    });
    expect(text).toContain("NEW Segment: Man Of Constant Sorrow, 2002-04-30");
    expect(text).toContain("setId: 2002-04-30, set 1");
    for (const word of ["joinsNext", "workCertainty", "cutAtStart", "extent"]) expect(text).not.toContain(word);
  });
  it("lists warnings first and prints no token when there is none", () => {
    const text = formatPreview({ ...base, items: [], warnings: ["Too many edits."] });
    expect(text.startsWith("WARNINGS")).toBe(true);
    expect(text).not.toContain("Apply token");
  });
});
