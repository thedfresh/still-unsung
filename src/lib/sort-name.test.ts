import { describe, expect, it } from "vitest";
import { compareNames, sortName } from "./sort-name";

describe("sortName", () => {
  it("drops a leading The, A or An", () => {
    expect(sortName("The Band")).toBe("band");
    expect(sortName("A Day in the Life")).toBe("day in the life");
    expect(sortName("An Evening")).toBe("evening");
  });
  it("keeps an article inside the name and a name that is only an article", () => {
    expect(sortName("Alabama")).toBe("alabama");
    expect(sortName("Another Day")).toBe("another day");
    expect(sortName("The")).toBe("the");
  });
});

describe("sortName and punctuation", () => {
  it("skips leading quote marks and brackets", () => {
    expect(sortName('"William Tell" Bridge')).toBe('william tell" bridge');
    expect(sortName("(Get Your Kicks on) Route 66")).toBe("get your kicks on) route 66");
  });
  it("skips punctuation before and after an article", () => {
    expect(sortName('"The Band"')).toBe('band"');
  });
  it("keeps a name that is only punctuation", () => {
    expect(sortName("...")).toBe("...");
  });
  it("sorts the two examples under W and G", () => {
    const sorted = ['"William Tell" Bridge', "(Get Your Kicks on) Route 66", "Alabama", "Xylophone"].sort(compareNames);
    expect(sorted).toEqual(["Alabama", "(Get Your Kicks on) Route 66", '"William Tell" Bridge', "Xylophone"]);
  });
});

describe("compareNames", () => {
  it("sorts The Band between Aces and Cats", () => {
    expect(["Cats", "The Band", "Aces", "A Boat"].sort(compareNames)).toEqual(["Aces", "The Band", "A Boat", "Cats"]);
  });
});
