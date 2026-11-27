import type { PublicShow } from "@/lib/data/public/show-types";
import { LICENSE_URL } from "@/lib/site-config";
import { publicDate, showHeading } from "@/lib/shows/public-words";

/**
 * JSON for a `<script type="application/ld+json">` tag. It escapes `<` as `<`, so a value
 * can never close the tag (Next.js guidance). The one helper for every page.
 */
export function jsonLdText(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The `MusicEvent` of a show. It carries only what the page shows. An unknown value has no
 * property, and a date that is not confirmed gives no `startDate` (the page says it in words).
 */
export function showJsonLd(show: PublicShow): Record<string, unknown> {
  const performer = show.band?.name ?? "Robert Hunter";
  const startDate = publicDate(show.date).iso;
  return {
    "@context": "https://schema.org",
    "@type": "MusicEvent",
    name: `${performer}: ${showHeading(show)}`,
    ...(startDate ? { startDate } : {}),
    ...(show.placeName ? { location: { "@type": "Place", name: show.placeName } } : {}),
    // Hunter himself is a person; every other band is a group.
    performer: { "@type": !show.band || show.band.slug === "robert-hunter" ? "Person" : "MusicGroup", name: performer },
    license: LICENSE_URL,
    dateModified: show.updatedAt.toISOString().slice(0, 10),
  };
}
