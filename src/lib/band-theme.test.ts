import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BAND_THEMES, bandThemeClass } from "@/lib/band-theme";
import { contrastRatio } from "@/lib/contrast";

const css = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");

/** The three colors of a band class, read from globals.css. */
function themeColors(slug: string) {
  const block = css.match(new RegExp(`\\.band-${slug}\\s*\\{([^}]*)\\}`))?.[1];
  if (!block) throw new Error(`No .band-${slug} class in globals.css`);
  const get = (name: string) => block.match(new RegExp(`--band-${name}:\\s*(#[0-9a-f]{6})`, "i"))?.[1] as string;
  return { bg: get("bg"), border: get("border"), ink: get("ink") };
}

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for the same color", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#a07c2f", "#a07c2f")).toBeCloseTo(1, 5);
  });
});

describe("bandThemeClass", () => {
  it("names the class after the slug of a Hunter band", () => {
    expect(bandThemeClass({ slug: "roadhog", isHunterBand: true })).toBe("band-roadhog");
    expect(bandThemeClass({ slug: "dinosaurs" })).toBe("band-dinosaurs");
  });
  it("gives a band that is not Hunter's the Guest Appearances theme", () => {
    expect(bandThemeClass({ slug: "jerry-garcia-band", isHunterBand: false })).toBe("band-guest-appearances");
    expect(bandThemeClass({ slug: "zero", isHunterBand: false })).toBe("band-guest-appearances");
  });
  it("gives other Hunter bands and a missing band the Ad Hoc theme, as the old site", () => {
    expect(bandThemeClass(null)).toBe("band-ad-hoc");
    expect(bandThemeClass({ slug: "the-mystery-band", isHunterBand: true })).toBe("band-ad-hoc");
    expect(bandThemeClass({ slug: "the-nazgul", isHunterBand: true })).toBe("band-ad-hoc");
    expect(bandThemeClass({ slug: null })).toBe("band-ad-hoc");
  });
  it("keeps the old site's colours for Guest Appearances (slate) and Ad Hoc (purple)", () => {
    expect(themeColors("guest-appearances")).toEqual({ bg: "#f8fafc", border: "#475569", ink: "#1e293b" });
    expect(themeColors("ad-hoc")).toEqual({ bg: "#f0e8f0", border: "#7d5a80", ink: "#4a3850" });
  });
});

describe.each(BAND_THEMES)("band theme $name", ({ slug }) => {
  const { bg, border, ink } = themeColors(slug);
  it("has text on the card with at least 4.5:1", () => {
    expect(contrastRatio(bg, "#222222")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(bg, ink)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#ffffff", ink)).toBeGreaterThanOrEqual(4.5);
  });
  it("has a border with at least 3:1 against the card and the page", () => {
    expect(contrastRatio(bg, border)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio("#ffffff", border)).toBeGreaterThanOrEqual(3);
  });
});
