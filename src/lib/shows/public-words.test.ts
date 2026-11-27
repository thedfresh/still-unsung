import { describe, expect, it } from "vitest";
import type { PublicDateParts, PublicShow } from "@/lib/data/public/show-types";
import { jsonLdText, showJsonLd } from "@/lib/json-ld";
import { publicDate, showSummary } from "./public-words";

const date = (over: Partial<PublicDateParts> = {}): PublicDateParts => ({
  dateYear: 1980,
  dateMonth: 11,
  dateDay: 14,
  dateEndYear: null,
  dateEndMonth: null,
  dateEndDay: null,
  dateAsWritten: null,
  dateCertainty: "CONFIRMED",
  ...over,
});

const show = (over: Partial<PublicShow> = {}): PublicShow => ({
  id: 1,
  slug: "s",
  date: date(),
  timeLabel: null,
  placeName: "Test Hall",
  placeCertainty: "CONFIRMED",
  billedAs: null,
  band: null,
  statusWords: null,
  bill: [],
  notes: [],
  sets: [],
  recordings: [],
  updatedAt: new Date("2026-11-27T10:00:00Z"),
  ...over,
});

describe("publicDate", () => {
  it("writes a full date in words with an ISO value", () => {
    expect(publicDate(date())).toEqual({ text: "November 14, 1980", iso: "1980-11-14" });
  });

  it("writes a partial date with only what is known", () => {
    expect(publicDate(date({ dateDay: null }))).toEqual({ text: "November 1980", iso: "1980-11" });
    expect(publicDate(date({ dateMonth: null, dateDay: null }))).toEqual({ text: "1980", iso: "1980" });
  });

  it("gives no ISO value for a date that is not confirmed, and says so in words", () => {
    expect(publicDate(date({ dateCertainty: "PROBABLE" }))).toEqual({ text: "November 14, 1980 (probable)", iso: null });
  });

  it("says when the date is not known", () => {
    expect(publicDate(date({ dateYear: null, dateMonth: null, dateDay: null }))).toEqual({ text: "Date not known", iso: null });
    expect(publicDate(date({ dateYear: null, dateMonth: null, dateDay: null, dateAsWritten: "summer '80" })).text).toBe("summer '80 (date as written)");
  });
});

describe("showSummary", () => {
  it("names the performer, the place and the date, and says it is the archive's record", () => {
    expect(showSummary(show())).toBe(
      "The archive records a show by Robert Hunter at Test Hall on November 14, 1980. The archive holds no setlist for it yet.",
    );
  });

  it("counts sets, song segments and recordings, and leaves talk out of the count", () => {
    const segment = (over: object) => ({
      id: 1,
      workTitle: "Song",
      workIsHidden: false,
      workCertainty: "CONFIRMED" as const,
      delivery: null,
      extent: "COMPLETE" as const,
      portionNote: null,
      joinsNext: false,
      summary: null,
      deliveredBy: null,
      notes: [],
      children: [],
      ...over,
    });
    const text = showSummary(
      show({
        sets: [{ id: 1, label: "Set", band: null, notes: [], segments: [segment({}), segment({ workTitle: null, delivery: "SPOKEN" })] }],
        recordings: [{ id: 1, type: null, description: null, taper: null, lengthMinutes: null, inCirculation: true, links: [] }],
      }),
    );
    expect(text).toContain("1 set, 1 song segment, 1 recording");
  });
});

describe("show JSON-LD", () => {
  it("omits the start date for an uncertain date and the location for an unknown place", () => {
    const ld = showJsonLd(show({ date: date({ dateCertainty: "POSSIBLE" }), placeName: null }));
    expect(ld).not.toHaveProperty("startDate");
    expect(ld).not.toHaveProperty("location");
  });

  it("gives a partial ISO date for a partial date", () => {
    expect(showJsonLd(show({ date: date({ dateDay: null }) }))).toMatchObject({ startDate: "1980-11" });
  });

  it("escapes < so a value cannot close the script tag", () => {
    expect(jsonLdText({ name: "</script><b>" })).not.toContain("<");
  });
});
