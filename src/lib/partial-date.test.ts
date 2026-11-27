import { describe, expect, it } from "vitest";
import { parsePartialDate } from "./partial-date";

describe("parsePartialDate", () => {
  it("accepts a full date, a year and month, a year only and nothing", () => {
    expect(parsePartialDate("1980", "11", "14")).toEqual({ ok: true, date: { year: 1980, month: 11, day: 14 } });
    expect(parsePartialDate("1980", "11", "")).toEqual({ ok: true, date: { year: 1980, month: 11, day: null } });
    expect(parsePartialDate("1980", "", "")).toEqual({ ok: true, date: { year: 1980, month: null, day: null } });
    expect(parsePartialDate(" ", "", "")).toEqual({ ok: true, date: { year: null, month: null, day: null } });
  });
  it("never fills a missing month or day", () => {
    const result = parsePartialDate("1980", "", "");
    expect(result.ok && result.date.month).toBeNull();
  });
  it("refuses a day without a month, a month without a year and bad numbers", () => {
    expect(parsePartialDate("1980", "", "14").ok).toBe(false);
    expect(parsePartialDate("", "11", "").ok).toBe(false);
    expect(parsePartialDate("1980", "13", "").ok).toBe(false);
    expect(parsePartialDate("19x0", "", "").ok).toBe(false);
  });
  it("refuses a day that is not in the month, and allows 29 February in a leap year", () => {
    expect(parsePartialDate("1981", "2", "29").ok).toBe(false);
    expect(parsePartialDate("1980", "2", "29").ok).toBe(true);
    expect(parsePartialDate("1980", "4", "31").ok).toBe(false);
  });
});
