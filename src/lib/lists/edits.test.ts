import { describe, expect, it } from "vitest";
import { listConfigBySlug } from "@/lib/lists/config";
import { checkValues, createEdit, moveEdits, updateEdit } from "@/lib/lists/edits";

const config = listConfigBySlug("link-systems")!;
const row = (id: number, position: number) => ({ id, rev: 1, position });

describe("moveEdits", () => {
  it("swaps the positions of two neighbours with two edits, whatever the list length", () => {
    const rows = Array.from({ length: 80 }, (_, i) => row(i + 1, i + 1));
    const edits = moveEdits(config, rows, 40, -1);
    expect(edits.map((e) => [e.id, e.fields.position])).toEqual([
      [40, 39],
      [39, 40],
    ]);
  });

  it("renumbers when the two neighbours share a position", () => {
    const edits = moveEdits(config, [row(1, 0), row(2, 0), row(3, 0)], 3, -1);
    expect(edits.map((e) => [e.id, e.fields.position])).toEqual([
      [3, 1],
      [2, 2],
    ]);
  });

  it("gives no edit past either end", () => {
    expect(moveEdits(config, [row(1, 1), row(2, 2)], 1, -1)).toEqual([]);
    expect(moveEdits(config, [row(1, 1), row(2, 2)], 2, 1)).toEqual([]);
    expect(moveEdits(config, [row(1, 1)], 9, 1)).toEqual([]);
  });
});

describe("value edits", () => {
  it("saves an empty optional text as null and trims text", () => {
    const edit = createEdit(config, { name: " Example ", purpose: "READ", urlTemplate: "  " }, 4);
    expect(edit.fields).toEqual({ position: 4, name: "Example", purpose: "READ", urlTemplate: null });
  });

  it("needs a required text", () => {
    expect(checkValues(config, { name: " ", purpose: "READ", urlTemplate: "" })).toBe('Enter a value for "Name".');
    expect(checkValues(config, { name: "x", purpose: "READ", urlTemplate: "" })).toBeNull();
  });

  it("sends only the fields that changed, and nothing when none did", () => {
    const stored = { id: 7, rev: 3, values: { name: "A", purpose: "READ", urlTemplate: null } };
    expect(updateEdit(config, stored, stored.values)).toBeNull();
    expect(updateEdit(config, stored, { ...stored.values, urlTemplate: "https://x/{value}" })).toMatchObject({
      id: 7,
      rev: 3,
      fields: { urlTemplate: "https://x/{value}" },
    });
  });
});
