import { describe, expect, it } from "vitest";
import { certaintyWords, cutWords, dateInWords, deliveryWords, describeOrigin, extentWords, joinMark, shortDate } from "./review-words";
import { parseShowSearch } from "./search";

const NO_DATE = { dateYear: null, dateMonth: null, dateDay: null, dateEndYear: null, dateEndMonth: null, dateEndDay: null, dateAsWritten: null, dateCertainty: "CONFIRMED" };

describe("dateInWords", () => {
  it("shows a full date as it is", () => {
    expect(dateInWords({ ...NO_DATE, dateYear: 1980, dateMonth: 11, dateDay: 14 })).toBe("1980-11-14");
  });
  it("says what a partial date is missing, and never invents a month or day", () => {
    expect(dateInWords({ ...NO_DATE, dateYear: 1980 })).toBe("1980 (month and day not known)");
    expect(dateInWords({ ...NO_DATE, dateYear: 1980, dateMonth: 11 })).toBe("1980-11 (day not known)");
  });
  it("shows certainty in words only when it is not confirmed", () => {
    expect(dateInWords({ ...NO_DATE, dateYear: 1980, dateMonth: 11, dateDay: 14, dateCertainty: "PROBABLE" })).toBe("1980-11-14 (probable)");
  });
  it("handles a range, a written date and no date", () => {
    expect(dateInWords({ ...NO_DATE, dateYear: 1980, dateMonth: 11, dateDay: 14, dateEndYear: 1980, dateEndMonth: 11, dateEndDay: 16 })).toBe("1980-11-14 to 1980-11-16");
    expect(dateInWords({ ...NO_DATE, dateAsWritten: "autumn 1980" })).toBe('as written: "autumn 1980"');
    expect(dateInWords(NO_DATE)).toBe("date not known");
    expect(shortDate({ dateYear: 1980, dateMonth: 11, dateDay: null, dateAsWritten: null })).toBe("1980-11");
  });
});

describe("words for values", () => {
  it("shows defaults as nothing", () => {
    expect(certaintyWords("CONFIRMED")).toBeNull();
    expect(extentWords("COMPLETE")).toBeNull();
    expect(deliveryWords(null)).toBeNull();
    expect(joinMark("STOPS")).toBeNull();
    expect(cutWords({ cutAtStart: false, cutAtEnd: false, hasGaps: false })).toEqual([]);
  });
  it("shows what differs", () => {
    expect(certaintyWords("POSSIBLE")).toBe("possible");
    expect(extentWords("FRAGMENT")).toBe("fragment");
    expect(deliveryWords("SUNG_A_CAPPELLA")).toBe("sung a cappella");
    expect(joinMark("RUNS_INTO")).toBe(">");
    expect(cutWords({ cutAtStart: true, cutAtEnd: false, hasGaps: true })).toEqual(["cut at the start", "has gaps"]);
  });
});

describe("describeOrigin", () => {
  const base = { path: "MCP", role: "AGENT", when: new Date("2026-11-25T12:00:00Z"), ownKnowledge: false, sourceTitle: null, recordingName: null, contributorName: null, place: null };
  it("says who, when and from what", () => {
    expect(describeOrigin({ ...base, recordingName: "FM recording" })).toBe('Added by the agent on 2026-11-25 from the recording "FM recording"');
    expect(describeOrigin({ ...base, path: "IMPORT", ownKnowledge: true })).toBe("Added by the import on 2026-11-25 from own knowledge");
    expect(describeOrigin({ ...base, path: "ADMIN", role: "ADMIN" })).toBe("Added by an admin on 2026-11-25");
  });
});

describe("parseShowSearch", () => {
  it("reads dates and place names", () => {
    expect(parseShowSearch("")).toEqual({ kind: "all" });
    expect(parseShowSearch("1980")).toEqual({ kind: "date", year: 1980, month: null, day: null });
    expect(parseShowSearch("1980-11")).toEqual({ kind: "date", year: 1980, month: 11, day: null });
    expect(parseShowSearch(" 1980-11-14 ")).toEqual({ kind: "date", year: 1980, month: 11, day: 14 });
    expect(parseShowSearch("1980-13")).toEqual({ kind: "place", text: "1980-13" });
    expect(parseShowSearch("WHFS")).toEqual({ kind: "place", text: "WHFS" });
  });
});
