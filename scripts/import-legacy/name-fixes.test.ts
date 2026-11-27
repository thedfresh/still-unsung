import { describe, expect, it } from "vitest";
import { CREDIT_FULL_NAMES, MUSICIAN_FULL_NAMES, creditFullName } from "./name-fixes.ts";

describe("name fixes", () => {
  it("keys each credit fix by one lower-case word, as the import compares it", () => {
    for (const names of CREDIT_FULL_NAMES.values()) {
      for (const [word, full] of names) {
        expect(word).toMatch(/^[a-z0-9]+$/);
        expect(full).toContain(" ");
      }
    }
  });

  it("finds a fix only on its own song", () => {
    expect(creditFullName("songs:171:musicBy", "welnick")).toBe("Vince Welnick");
    expect(creditFullName("songs:172:musicBy", "welnick")).toBeUndefined();
    expect(creditFullName("musicians:91", "welnick")).toBeUndefined();
  });

  it("gives Pigpen and McKernan the same person", () => {
    expect(creditFullName("songs:16:lyricsBy", "pigpen")).toBe(creditFullName("songs:139:musicBy", "mckernan"));
  });

  it("names each one-name musician in full", () => {
    for (const fix of MUSICIAN_FULL_NAMES.values()) expect(fix.name).toBe(`${fix.firstName} ${fix.lastName}`);
  });
});
