/** The five band themes. Each is one CSS class in globals.css, named `band-<slug>`. */
export const BAND_THEMES = [
  { slug: "robert-hunter", name: "Robert Hunter" },
  { slug: "roadhog", name: "Roadhog" },
  { slug: "comfort", name: "Comfort" },
  { slug: "dinosaurs", name: "Dinosaurs" },
  { slug: "guest-appearances", name: "Guest Appearances" },
] as const;

const DEFAULT_SLUG = "robert-hunter";
const KNOWN = new Set<string>(BAND_THEMES.map((b) => b.slug));

/** The theme class for a band record's slug. An unknown or missing slug gets the default theme. */
export function bandThemeClass(slug: string | null | undefined): string {
  return `band-${slug && KNOWN.has(slug) ? slug : DEFAULT_SLUG}`;
}
