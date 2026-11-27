import { describe, expect, it } from "vitest";
import { adminHref, publicHref, recordAddress, showsListHref } from "./record-links";

describe("adminHref", () => {
  it("gives the admin page of each record type that has one", () => {
    expect(adminHref("Show", 7)).toBe("/admin/shows/7");
    expect(adminHref("Work", 8)).toBe("/admin/works/8");
    expect(adminHref("Person", 9)).toBe("/admin/people/9");
    expect(adminHref("Band", 10)).toBe("/admin/bands/10");
    expect(adminHref("Place", 11)).toBe("/admin/places/11");
  });
  it("gives null for a type with no page yet", () => {
    expect(adminHref("Source", 1)).toBeNull();
    expect(adminHref("Segment", 1)).toBeNull();
  });
});

describe("publicHref", () => {
  it("gives the public page of a show with a slug", () => {
    expect(publicHref("Show", "1978-05-23-olympia")).toBe("/shows/1978-05-23-olympia");
  });
  it("gives null with no slug or no public page", () => {
    expect(publicHref("Show", null)).toBeNull();
    expect(publicHref("Show", "")).toBeNull();
    expect(publicHref("Work", "ripple")).toBeNull();
  });
});

describe("recordAddress", () => {
  it("gives both addresses", () => {
    expect(recordAddress("Show", 3, "a-show")).toEqual({ admin: "/admin/shows/3", public: "/shows/a-show" });
    expect(recordAddress("Band", 4)).toEqual({ admin: "/admin/bands/4", public: null });
  });
});

describe("showsListHref", () => {
  it("sets one filter", () => {
    expect(showsListHref({ place: 5 })).toBe("/admin/shows?place=5");
    expect(showsListHref({ band: 6 })).toBe("/admin/shows?band=6");
    expect(showsListHref({ work: 7 })).toBe("/admin/shows?work=7");
  });
  it("marks the direct shows of a place, and ignores direct without a place", () => {
    expect(showsListHref({ place: 5, direct: true })).toBe("/admin/shows?place=5&direct=1");
    expect(showsListHref({ direct: true })).toBe("/admin/shows");
  });
  it("gives the plain list for no filter", () => {
    expect(showsListHref({})).toBe("/admin/shows");
  });
});
