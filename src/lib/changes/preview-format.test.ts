import { describe, expect, it } from "vitest";
import { describeRecord } from "@/lib/changes/labels";
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
  it("lists warnings first and prints no token when there is none", () => {
    const text = formatPreview({ ...base, items: [], warnings: ["Too many edits."] });
    expect(text.startsWith("WARNINGS")).toBe(true);
    expect(text).not.toContain("Apply token");
  });
});
