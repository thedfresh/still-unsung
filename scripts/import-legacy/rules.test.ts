import { describe, expect, it } from "vitest";
import {
  assignShowTiming,
  displayDateMatches,
  externalValue,
  findUrls,
  footnoteKinds,
  noteHints,
  routeLink,
  slugify,
  sortKeys,
  splitCredit,
  suiteForTag,
  takeContributorLines,
  vocalRoleOf,
} from "./rules.ts";

describe("slugify", () => {
  it("makes a key from a name", () => {
    expect(slugify("Bill Gallagher")).toBe("bill-gallagher");
    expect(slugify("  José  Núñez, Jr. ")).toBe("jose-nunez-jr");
  });
});

describe("splitCredit", () => {
  it("splits plain names", () => {
    expect(splitCredit("Test Author / Other Writer")).toEqual(["Test Author", "Other Writer"]);
    expect(splitCredit("First Person, Second Person & Third Person")).toEqual([
      "First Person",
      "Second Person",
      "Third Person",
    ]);
  });
  it("refuses text that is not a plain list of names", () => {
    expect(splitCredit("Traditional")).toBeNull();
    expect(splitCredit("Words by Someone Else")).toBeNull();
    expect(splitCredit("Someone (arr. 1970)")).toBeNull();
    expect(splitCredit("Sammy Davis, Jr.")).toBeNull();
    expect(splitCredit("a b c d e f")).toBeNull();
    expect(splitCredit("")).toBeNull();
  });
});

describe("takeContributorLines", () => {
  const people = new Map([["test contributor", 7]]);
  const resolve = (name: string) => people.get(name.toLowerCase()) ?? null;

  it("removes only the lines that match a person", () => {
    const note = "Taped from the third row.\nContributor: Test Contributor\nContributor: Nobody Known";
    const out = takeContributorLines(note, resolve);
    expect(out.matched).toEqual([7]);
    expect(out.unmatched).toBe(1);
    expect(out.remaining).toBe("Taped from the third row.\nContributor: Nobody Known");
  });
  it("returns no note when only citations were in it", () => {
    expect(takeContributorLines("Contributor: Test Contributor", resolve).remaining).toBeNull();
  });
  it("leaves other lines alone", () => {
    const out = takeContributorLines("Contributed by hand.", resolve);
    expect(out.matched).toEqual([]);
    expect(out.remaining).toBe("Contributed by hand.");
  });
});

describe("displayDateMatches", () => {
  it("accepts the usual renderings of the parts", () => {
    expect(displayDateMatches("1999-01-02", 1999, 1, 2)).toBe(true);
    expect(displayDateMatches("January 2, 1999", 1999, 1, 2)).toBe(true);
    expect(displayDateMatches("Jan 2 1999", 1999, 1, 2)).toBe(true);
    expect(displayDateMatches("1999", 1999, null, null)).toBe(true);
    expect(displayDateMatches("March 1999", 1999, 3, null)).toBe(true);
  });
  it("rejects text that says more or something else", () => {
    expect(displayDateMatches("Winter 1999", 1999, null, null)).toBe(false);
    expect(displayDateMatches("1999?", 1999, 1, 2)).toBe(false);
  });
});

describe("assignShowTiming", () => {
  const show = (id: number, timing: string | null, day = 2) => ({ id, year: 1999, month: 1, day, timing });

  it("orders an early and a late show on one date", () => {
    const out = assignShowTiming([show(1, "Late"), show(2, "Early")]);
    expect(out.get(2)).toMatchObject({ timeLabel: "Early", orderOnDate: 1 });
    expect(out.get(1)).toMatchObject({ timeLabel: "Late", orderOnDate: 2 });
  });
  it("lists a lone early or late show as unpaired and gives no order", () => {
    const out = assignShowTiming([show(1, "Early"), show(2, null, 9)]);
    expect(out.get(1)).toMatchObject({ unpaired: true, orderOnDate: null });
    expect(out.get(2)).toMatchObject({ unpaired: false, orderOnDate: null, timeLabel: null });
  });
  it("handles three clock times, midnight last", () => {
    const out = assignShowTiming([show(1, "midnight"), show(2, "8:00 PM"), show(3, "10:00 PM")]);
    expect(out.get(2)).toMatchObject({ orderOnDate: 1, scheduledTime: "20:00:00", timeLabel: null });
    expect(out.get(3)).toMatchObject({ orderOnDate: 2, scheduledTime: "22:00:00" });
    expect(out.get(1)).toMatchObject({ orderOnDate: 3, scheduledTime: "24:00:00", timeLabel: "Midnight" });
  });
  it("gives no order to several shows that no label or time orders", () => {
    const out = assignShowTiming([show(1, null), show(2, null)]);
    expect(out.get(1)).toMatchObject({ orderOnDate: null, unordered: true });
    expect(out.get(2)).toMatchObject({ orderOnDate: null, unordered: true });
    const mixed = assignShowTiming([show(1, "Early"), show(2, null)]);
    expect(mixed.get(1)).toMatchObject({ orderOnDate: null, unordered: true });
    const tie = assignShowTiming([show(1, "Early"), show(2, "Early")]);
    expect(tie.get(1)?.orderOnDate).toBeNull();
  });
  it("does not read a time with no am or pm as morning", () => {
    const out = assignShowTiming([show(1, "8:00")]);
    expect(out.get(1)).toMatchObject({ scheduledTime: null, timeLabel: "8:00", ambiguousTime: true });
    expect(assignShowTiming([show(1, "20:00")]).get(1)).toMatchObject({ scheduledTime: "20:00:00", ambiguousTime: false });
  });
  it("keeps unknown text as the label", () => {
    const out = assignShowTiming([show(1, "Afternoon")]);
    expect(out.get(1)).toMatchObject({ timeLabel: "Afternoon", scheduledTime: null });
  });
});

describe("sortKeys", () => {
  it("makes keys in byte order", () => {
    const keys = sortKeys(200);
    expect(keys[0]).toBe("a0");
    expect(keys[61]).toBe("az");
    expect(keys[62]).toBe("b00");
    expect([...keys].sort()).toEqual(keys);
    expect(new Set(keys).size).toBe(200);
  });
});

describe("small rules", () => {
  it("reads the vocal role", () => {
    expect(vocalRoleOf("Harmony")).toBe("HARMONY");
    expect(vocalRoleOf("backup")).toBe("BACKING");
    expect(vocalRoleOf("Lead")).toBe("LEAD");
    expect(vocalRoleOf(null)).toBe("UNKNOWN");
    expect(vocalRoleOf("Unknown")).toBe("UNKNOWN");
    expect(vocalRoleOf("lead and harmony")).toBe("UNKNOWN");
  });
  it("finds the suite a tag names", () => {
    expect(suiteForTag("Alligator Moon")?.structure).toBe("FIXED");
    expect(suiteForTag("terrapin station")?.structure).toBe("VARIABLE");
    expect(suiteForTag("dylan")).toBeNull();
  });
  it("finds urls without trailing punctuation", () => {
    expect(findUrls("See https://example.test/a, and (https://example.test/b).")).toEqual([
      "https://example.test/a",
      "https://example.test/b",
    ]);
  });
  it("routes links", () => {
    expect(routeLink("https://whitegum.example/song", null)).toEqual({ kind: "whitegum" });
    expect(routeLink("https://x.test", "YouTube")).toEqual({ kind: "external", system: "YouTube" });
    expect(routeLink("https://x.test", "Newspaper").kind).toBe("report");
    expect(routeLink("https://x.test", "Odd").kind).toBe("report");
  });
  it("takes the identifier out of a url when it can", () => {
    expect(externalValue("Live Music Archive", "https://archive.org/details/gd99-01-02")).toBe("gd99-01-02");
    expect(externalValue("YouTube", "https://www.youtube.com/watch?v=abcdef123")).toBe("abcdef123");
    expect(externalValue("Wikipedia", "https://w.test/x")).toBe("https://w.test/x");
  });
  it("hints at review lists", () => {
    expect(noteHints("Sung a cappella.")).toContain("a-cappella");
    expect(noteHints("Joined by a guest on flute.")).toContain("guest");
    expect(noteHints("Opening act: Test Act")).toContain("bill");
    expect(noteHints("Nothing special.")).toEqual([]);
  });
  it("types footnotes a rule can type", () => {
    expect(footnoteKinds("Last verse only")).toContain("portion");
    expect(footnoteKinds("Instrumental version")).toContain("instrumental");
    expect(footnoteKinds("Lead-in from another song")).toContain("lead-in");
    expect(footnoteKinds("Plain remark")).toEqual([]);
  });
});
