/** The five band themes. Each is one CSS class in globals.css, named `band-<slug>`. */
export const BAND_THEMES = [
  { slug: "robert-hunter", name: "Robert Hunter" },
  { slug: "roadhog", name: "Roadhog" },
  { slug: "comfort", name: "Comfort" },
  { slug: "dinosaurs", name: "Dinosaurs" },
  { slug: "guest-appearances", name: "Guest Appearances" },
] as const;

const DEFAULT_SLUG = "robert-hunter";
/** Not a band in the data: the theme for any band that is not one of Hunter's (`isHunterBand` false). */
const GUEST_SLUG = "guest-appearances";
const KNOWN = new Set<string>(BAND_THEMES.map((b) => b.slug));

/** The fields of a band record that choose its theme. */
export type ThemedBand = { slug?: string | null; isHunterBand?: boolean | null };

/**
 * The theme class for a band record. A band that is not one of Hunter's (the Jerry Garcia Band,
 * Zero, the New Riders) gets the Guest Appearances theme, as on the old site. A Hunter band with
 * its own theme (Robert Hunter, Roadhog, Comfort, Dinosaurs) gets that theme. Any other Hunter
 * band, or a missing band, gets the default (Robert Hunter) theme.
 */
export function bandThemeClass(band: ThemedBand | null | undefined): string {
  if (band?.isHunterBand === false) return `band-${GUEST_SLUG}`;
  const slug = band?.slug;
  return `band-${slug && KNOWN.has(slug) ? slug : DEFAULT_SLUG}`;
}
