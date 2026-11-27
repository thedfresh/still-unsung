/**
 * The six band themes, as on the old site (`lib/config/bands.ts` in the planning repo). Each is one
 * CSS class in globals.css, named `band-<slug>`. "Guest Appearances" and "Ad Hoc Bands" are not
 * bands in the data: they are the themes for groups of bands (HSA-182).
 */
export const BAND_THEMES = [
  { slug: "robert-hunter", name: "Robert Hunter" },
  { slug: "roadhog", name: "Roadhog" },
  { slug: "comfort", name: "Comfort" },
  { slug: "dinosaurs", name: "Dinosaurs" },
  { slug: "guest-appearances", name: "Guest Appearances" },
  { slug: "ad-hoc", name: "Ad Hoc Bands" },
] as const;

/** The theme for any band that is not one of Hunter's (`isHunterBand` false). */
const GUEST_SLUG = "guest-appearances";
/** The theme for any other Hunter band, and for a show with no band (the old site's default). */
const AD_HOC_SLUG = "ad-hoc";
const KNOWN = new Set<string>(BAND_THEMES.map((b) => b.slug));

/** The fields of a band record that choose its theme. */
export type ThemedBand = { slug?: string | null; isHunterBand?: boolean | null };

/**
 * The theme class for a band record, as the old site chose it:
 * - a band that is not one of Hunter's (the Jerry Garcia Band, Zero, the New Riders) gets the
 *   Guest Appearances theme;
 * - Robert Hunter, Roadhog, Comfort and Dinosaurs get their own theme;
 * - any other Hunter band (the Mystery Band, the Nazgûl…), or no band, gets the Ad Hoc theme.
 */
export function bandThemeClass(band: ThemedBand | null | undefined): string {
  if (band?.isHunterBand === false) return `band-${GUEST_SLUG}`;
  const slug = band?.slug;
  return `band-${slug && KNOWN.has(slug) ? slug : AD_HOC_SLUG}`;
}
