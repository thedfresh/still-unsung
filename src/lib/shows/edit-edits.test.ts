import { describe, expect, it } from "vitest";
import { addSegmentEdit, BLANK_SEGMENT, draftOfShow, moveSegmentEdit, parsePlacement, showFieldsEdit, type Built } from "./edit-edits";
import type { EditSegment, ShowEditData } from "./edit-types";

const segment = (id: number, sortKey: string, parentId: number | null = null): EditSegment => ({
  id,
  rev: 1,
  parentId,
  sortKey,
  depth: 0,
  number: String(id),
  workId: null,
  workTitle: null,
  delivery: null,
  extent: "COMPLETE",
  joinsNext: false,
  portionNote: null,
  summary: null,
});

const show = {
  id: 1,
  rev: 3,
  year: 1980,
  month: 11,
  day: 14,
  dateAsWritten: null,
  place: null,
  placeNameId: null,
  billedAs: null,
  band: null,
  status: "TOOK_PLACE",
} as unknown as ShowEditData;

describe("showFieldsEdit", () => {
  it("sends only the fields that changed, with the rev", () => {
    const result = showFieldsEdit(show, { ...draftOfShow(show), day: "", billedAs: " Flyer " });
    expect(result).toEqual({ edits: [{ op: "update", type: "Show", id: 1, rev: 3, fields: { dateDay: null, billedAs: "Flyer" } }] });
  });
  it("makes no edit when nothing changed", () => {
    expect(showFieldsEdit(show, draftOfShow(show))).toEqual({ edits: [] });
  });
  it("needs a place name when the place changes", () => {
    expect(showFieldsEdit(show, { ...draftOfShow(show), placeId: 5, placeNameId: null })).toEqual({ error: "Pick one of the place's names." });
  });
});

/** The sort key of the first edit of a built save. */
function keyOf(built: Built): string {
  if ("error" in built) throw new Error(built.error);
  return String(built.edits[0].fields?.sortKey);
}

describe("segment order", () => {
  const list = [segment(1, "a"), segment(2, "b"), segment(3, "c")];
  it("moves a segment by changing only its own sort key", () => {
    const result = moveSegmentEdit(list, 3, -1);
    expect(result).toMatchObject({ edits: [{ op: "update", type: "Segment", id: 3, rev: 1 }] });
    const key = keyOf(result);
    expect(key > "a" && key < "b").toBe(true);
  });
  it("does not move past an end", () => {
    expect(moveSegmentEdit(list, 1, -1)).toEqual({ edits: [] });
    expect(moveSegmentEdit(list, 3, 1)).toEqual({ edits: [] });
  });
  it("places a new segment after another one with a key between the neighbours", () => {
    const key = keyOf(addSegmentEdit(9, list, parsePlacement("after:1"), BLANK_SEGMENT));
    expect(key > "a" && key < "b").toBe(true);
  });
  it("refuses a summary over 300 characters", () => {
    expect(addSegmentEdit(9, list, { kind: "end" }, { ...BLANK_SEGMENT, summary: "x".repeat(301) })).toHaveProperty("error");
  });
});
