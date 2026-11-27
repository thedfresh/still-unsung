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

describe("compareNames", () => {
  it("sorts The Band between Aces and Cats", () => {
    expect(["Cats", "The Band", "Aces", "A Boat"].sort(compareNames)).toEqual(["Aces", "The Band", "A Boat", "Cats"]);
  });
});
