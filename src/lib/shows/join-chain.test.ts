import { describe, expect, it } from "vitest";
import { dropWithJoins } from "./join-chain";

const item = (name: string, joinsNext: boolean) => ({ name, joinsNext });
const names = (items: { name: string }[]) => items.map((i) => i.name);

describe("dropWithJoins", () => {
  it("keeps everything when nothing drops", () => {
    const out = dropWithJoins([item("a", true), item("b", false)], () => true);
    expect(out).toEqual([item("a", true), item("b", false)]);
  });

  it("carries a segue across a dropped item that also runs on", () => {
    const out = dropWithJoins([item("a", true), item("x", true), item("b", false)], (i) => i.name !== "x");
    expect(names(out)).toEqual(["a", "b"]);
    expect(out[0].joinsNext).toBe(true);
  });

  it("breaks the segue when the dropped item stops", () => {
    const out = dropWithJoins([item("a", true), item("x", false), item("b", false)], (i) => i.name !== "x");
    expect(out[0].joinsNext).toBe(false);
  });

  it("breaks the segue when the item before the dropped one stops", () => {
    const out = dropWithJoins([item("a", false), item("x", true), item("b", false)], (i) => i.name !== "x");
    expect(out[0].joinsNext).toBe(false);
  });

  it("never marks the last item as running into something", () => {
    expect(dropWithJoins([item("a", true), item("x", true)], (i) => i.name === "a")[0].joinsNext).toBe(false);
  });

  it("does not change its input", () => {
    const input = [item("a", true), item("x", false), item("b", false)];
    dropWithJoins(input, (i) => i.name !== "x");
    expect(input[0].joinsNext).toBe(true);
  });
});
