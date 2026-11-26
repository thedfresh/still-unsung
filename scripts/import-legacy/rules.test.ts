import { describe, expect, it } from "vitest";
import {
  assignShowTiming,
  countryOf,
  csvLine,
  displayDateMatches,
  externalValue,
  findUrls,
  fixDoubledTitle,
  footnoteKinds,
  isBilledName,
  isBookTitle,
  isFestivalName,
  isReviewCredit,
  isSeasonDate,
  isUnknownSong,
  isUnknownVenue,
  noteHints,
  parseTraditional,
  rewriteSongLinks,
  routeLink,
  slugify,
  sortKeys,
  splitCredit,
  splitTimeOfDay,
  suiteForTag,
  surnameOf,
  takeContributorLines,
  vocalRoleOf,
  whitegumValue,
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
    expect(vocalRoleOf("default")).toBe("LEAD");
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

describe("audit decisions (items 118 to 121)", () => {
  it("hints at the new review lists", () => {
    expect(noteHints("Teases Dark Star.")).toContain("quote-or-tease");
    expect(noteHints("Reportedly played; not on the tape.")).toContain("reported");
    expect(noteHints("Hunter does not play on this song.")).toContain("hunter-absent");
    expect(noteHints("From Jerry's album, Test Record.")).toContain("from-album");
    expect(noteHints('From Barry Melton\'s "Level With Me" album')).toContain("from-album");
    expect(noteHints("Hunter plays guitar.")).toEqual([]);
  });

  it("matches suite tags with hyphens", () => {
    expect(suiteForTag("alligator-moon-suite")?.title).toBe("Alligator Moon");
    expect(suiteForTag("eagle-mall-suite")?.title).toBe("Eagle Mall");
    const amagamalin = suiteForTag("amagamalin-suite");
    expect(amagamalin).toMatchObject({ title: "Amagamalin Street", structure: "VARIABLE", album: true });
  });

  it("takes the Whitegum page name with any anchor", () => {
    expect(whitegumValue("https://www.whitegum.com/songfile/Ripple.htm")).toBe("Ripple.htm");
    expect(whitegumValue("https://www.whitegum.com/songfile/Ripple.htm#verse2")).toBe("Ripple.htm#verse2");
    // The page sits in a query string.
    expect(whitegumValue("https://www.whitegum.com/introjs.htm?/songfile/STAGGERL.HTM")).toBe("STAGGERL.HTM");
    // A page outside /songfile/ has no address in the template: the caller lists it.
    expect(whitegumValue("https://www.whitegum.com/stagroot.htm")).toBeNull();
    expect(whitegumValue("https://whitegum.example/alpha")).toBeNull();
  });

  it("reads the typo and the bracket form of Traditional", () => {
    expect(parseTraditional("Tradititional")).toEqual({ arrangers: [], authors: [] });
    expect(parseTraditional("Traditional (Hunter)")).toEqual({ arrangers: ["Hunter"], authors: [] });
    expect(parseTraditional("Traditional (public domain)")).toBeNull();
  });

  it("reads \"Traditional\" as a marker, with arrangers and a second author", () => {
    expect(parseTraditional("Traditional")).toEqual({ arrangers: [], authors: [] });
    expect(parseTraditional("Traditional, arr. Hunter")).toEqual({ arrangers: ["Hunter"], authors: [] });
    expect(parseTraditional("Traditional, arr. Dave Guard")).toEqual({ arrangers: ["Dave Guard"], authors: [] });
    expect(parseTraditional("Traditional/Arthur Smith, arr. Garcia")).toEqual({ arrangers: ["Garcia"], authors: ["Arthur Smith"] });
    expect(parseTraditional("Traditional arr. Josh White")).toEqual({ arrangers: ["Josh White"], authors: [] });
    expect(parseTraditional("Test Author")).toBeNull();
    expect(parseTraditional("Grateful Dead")).toBeNull();
  });

  it("lists the odd credit texts for review", () => {
    for (const text of ["Grateful Dead", "Elias McDaniel (Bo Diddley)", "Jeffrey Dambrau(?)"]) expect(isReviewCredit(text)).toBe(true);
    expect(isReviewCredit("Test Author")).toBe(false);
    expect(surnameOf("Jerry Garcia")).toBe("garcia");
    expect(surnameOf("Garcia")).toBeNull();
  });

  it("keeps only a true billed name in billedAs", () => {
    expect(isBilledName("Test Band with Test Opener")).toBe(true);
    expect(isBilledName("Opened for Test Act")).toBe(false);
    expect(isBilledName("Performed between two bands")).toBe(false);
    // The words may sit anywhere in the text.
    expect(isBilledName("Comfort opened for the Jerry Garcia Band")).toBe(false);
    expect(isBilledName("Comfort opened for Robert Palmer / Bonnie Raitt")).toBe(false);
    expect(isBilledName("Co-headline with Jorma Kaukonen")).toBe(false);
    expect(isBilledName("No Nukes Rally")).toBe(false);
    expect(isBilledName("Furthur Festival")).toBe(false);
    expect(isBilledName("Whole Earth Festival")).toBe(false);
  });

  it("fixes a doubled album title and finds the books", () => {
    expect(fixDoubledTitle("Tales of the Great Rum Runners Tales of the Great Rum Runners 50th Bonus Disc")).toBe("Tales of the Great Rum Runners 50th Bonus Disc");
    expect(fixDoubledTitle("Rum Runners (Rum Runners 50th Bonus Disc)")).toBe("(Rum Runners 50th Bonus Disc)");
    // The real form: a whole-string repeat with no space between the copies.
    expect(fixDoubledTitle("Tales Of The Great Rum Runners 50th Anniversary Bonus DiscTales Of The Great Rum Runners 50th Anniversary Bonus Disc")).toBe("Tales Of The Great Rum Runners 50th Anniversary Bonus Disc");
    expect(fixDoubledTitle("Bye Bye Love")).toBe("Bye Bye Love");
    expect(fixDoubledTitle("Rock Columbia")).toBe("Rock Columbia");
    for (const title of ["A Box of Rain", "Sentinel", "Rilke: Duino Elegies"]) expect(isBookTitle(title)).toBe(true);
    expect(isBookTitle("Tales of the Great Rum Runners")).toBe(false);
  });

  it("puts the United States above US states and festivals in their own list", () => {
    expect(countryOf(null, "CA")).toBe("United States");
    expect(countryOf(null, "New York")).toBe("United States");
    expect(countryOf("USA", "CA")).toBe("United States");
    expect(countryOf("Canada", "ON")).toBe("Canada");
    expect(countryOf(null, "ON")).toBeNull();
    expect(isFestivalName("Fête des Leus")).toBe(true);
    expect(isFestivalName("Songwriters Hall of Fame")).toBe(true);
    expect(isFestivalName("Summer Test Festival")).toBe(true);
    expect(isFestivalName("Test Hall")).toBe(false);
  });

  it("finds unknown venues and unknown songs", () => {
    expect(isUnknownVenue("Unknown Venue")).toBe(true);
    expect(isUnknownVenue("Unknown Studio Location")).toBe(true);
    expect(isUnknownVenue("Unknown Studio")).toBe(true);
    expect(isUnknownVenue("Unknown Hall of Fame")).toBe(false);
    expect(isUnknownSong("Unknown Song")).toBe(true);
    expect(isUnknownSong("Unknown Instrumental")).toBe(true);
    expect(isUnknownSong("Unknown Pleasures")).toBe(false);
  });

  it("reads season dates and a time of day in the written date", () => {
    expect(isSeasonDate("Summer 1976")).toBe(true);
    expect(isSeasonDate("June 1976")).toBe(false);
    expect(splitTimeOfDay("June 5, 1977 (Afternoon)")).toEqual({ display: "June 5, 1977", label: "Afternoon" });
    expect(splitTimeOfDay("June 5, 1977")).toEqual({ display: "June 5, 1977", label: null });
    expect(splitTimeOfDay(null)).toEqual({ display: null, label: null });
  });

  it("rewrites old internal song links as wikilinks", () => {
    const titles = new Map([["alpha-song", "Alpha Song"]]);
    expect(rewriteSongLinks("See [Alpha Song](/song/alpha-song).", titles)).toEqual({ text: "See [[song:Alpha Song]].", changed: 1, unresolved: 0 });
    expect(rewriteSongLinks("See [the first](/song/alpha-song#x) and [no](/song/none).", titles)).toEqual({
      text: "See [[song:Alpha Song|the first]] and [no](/song/none).",
      changed: 1,
      unresolved: 1,
    });
    expect(rewriteSongLinks("A [site](https://example.test/song/x).", titles).changed).toBe(0);
  });

  it("writes a CSV line with quotes where it needs them", () => {
    expect(csvLine(["a", 1, null, true, "b,c", 'say "hi"', "two\nlines"])).toBe('a,1,,true,"b,c","say ""hi""","two\nlines"');
  });
});
