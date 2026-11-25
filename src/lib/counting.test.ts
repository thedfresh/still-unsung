import { describe, expect, it } from "vitest";
import { countsAsPerformance } from "@/lib/counting";

describe("countsAsPerformance", () => {
  it("counts every delivery except a recording played", () => {
    for (const delivery of [null, undefined, "SUNG", "SUNG_A_CAPPELLA", "PLAYED", "SPOKEN"]) {
      expect(countsAsPerformance(delivery)).toBe(true);
    }
    expect(countsAsPerformance("RECORDING_PLAYED")).toBe(false);
  });
});
