/**
 * One place that knows the address of a record (HSA-186). Every page links a record's name and a
 * count of records through these helpers, so the links are the same everywhere. A record type
 * with no page yet gives `null`; the page shows plain text, and the link follows when the page
 * arrives (docs/CONVENTIONS.md, section 14).
 */

/** The admin path segment of each record type that has an admin page. */
const ADMIN_PATH: Record<string, string> = {
  Show: "shows",
  Work: "works",
  Person: "people",
  Band: "bands",
  Place: "places",
};

/** The record types that have a public page. Only shows so far; the page is found by slug. */
const PUBLIC_PATH: Record<string, string> = { Show: "shows" };

/** The admin page of a record, or null when its type has none yet. */
export function adminHref(type: string, id: number): string | null {
  const path = ADMIN_PATH[type];
  return path ? `/admin/${path}/${id}` : null;
}

/** The public page of a record, or null when its type has none or the record has no slug. */
export function publicHref(type: string, slug: string | null | undefined): string | null {
  const path = PUBLIC_PATH[type];
  return path && slug ? `/${path}/${slug}` : null;
}

/** The admin and the public address of a record, by type and ID. */
export function recordAddress(type: string, id: number, slug?: string | null): { admin: string | null; public: string | null } {
  return { admin: adminHref(type, id), public: publicHref(type, slug) };
}

/** The filters of the admin shows list that a count of shows can link to. */
export interface ShowsFilter {
  /** Shows at this place and at every place inside it (HSA-185). */
  place?: number;
  /** With `place`: only the shows attached to the place itself. */
  direct?: boolean;
  band?: number;
  /** Shows that have a segment of this work. */
  work?: number;
}

/** The admin shows list with a filter set. This is where a count of shows links to. */
export function showsListHref(filter: ShowsFilter): string {
  const query = new URLSearchParams();
  if (filter.place !== undefined) query.set("place", String(filter.place));
  if (filter.place !== undefined && filter.direct) query.set("direct", "1");
  if (filter.band !== undefined) query.set("band", String(filter.band));
  if (filter.work !== undefined) query.set("work", String(filter.work));
  const text = query.toString();
  return text ? `/admin/shows?${text}` : "/admin/shows";
}
