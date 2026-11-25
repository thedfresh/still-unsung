import { describe, expect, it } from "vitest";
import { describeRecord, filledFields, segmentLabel, setLabel, withType } from "@/lib/changes/labels";
import { formatPreview } from "@/lib/changes/preview-format";
import type { ReadoutItem } from "@/lib/changes/readout";

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
  it("names a spoken segment by its summary, and a sung one by its song", () => {
    const summary = "Hunter reads a poem.";
    expect(segmentLabel("WHFS interview", "1980-11-14", { delivery: "SPOKEN", summary })).toBe("Hunter reads a poem., 1980-11-14");
    expect(segmentLabel(null, "1980-11-14", { delivery: null, summary })).toBe("Hunter reads a poem., 1980-11-14");
    expect(segmentLabel("Ripple", "1980-11-14", { delivery: "SUNG", summary })).toBe("Ripple, 1980-11-14");
    expect(segmentLabel("Ripple", "1980-11-14", { delivery: "RECORDING_PLAYED", summary })).toBe("Ripple, 1980-11-14");
    expect(segmentLabel("WHFS interview", "1980-11-14", { delivery: "SPOKEN", summary: null })).toBe("WHFS interview, 1980-11-14");
  });
  it("cuts a long summary to about 80 characters", () => {
    const label = segmentLabel("x", null, { delivery: "SPOKEN", summary: "word ".repeat(40) });
    expect(label.length).toBeLessThanOrEqual(80);
    expect(label.endsWith("…")).toBe(true);
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
  const base = { evidence: "own knowledge", isPublic: false, warnings: [], expiresAt: null, token: null };
  const none = { before: {}, after: {} };
  const item: ReadoutItem = { op: "update", type: "Show", label: "Show 1978-05-23, Keystone", before: { id: 1, rev: 1, timeLabel: null }, after: { id: 1, rev: 2, timeLabel: "Late" }, links: none, parent: null };
  it("starts with the readout and ends with the evidence and the token", () => {
    const expiresAt = new Date("2026-01-01T00:30:00Z");
    const text = formatPreview({ ...base, items: [item], token: "suprev_x", expiresAt });
    expect(text.startsWith("Changed 1 show.")).toBe(true);
    expect(text).toContain("time label: “Late”");
    expect(text).not.toMatch(/\brev\b/);
    expect(text).toContain("Evidence: own knowledge");
    expect(text).toContain("Apply token: suprev_x");
  });
  it("lists warnings first and prints no token when there is none", () => {
    const text = formatPreview({ ...base, items: [], warnings: ["Too many edits."] });
    expect(text.startsWith("WARNINGS")).toBe(true);
    expect(text).not.toContain("Apply token");
  });
});
