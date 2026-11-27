import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { placeIdsInside } from "@/lib/data/places";
import { publicHref, type ShowsFilter } from "@/lib/record-links";
import { shortDate } from "@/lib/shows/review-words";
import { parseShowSearch } from "@/lib/shows/search";
import type { ShowSort } from "@/lib/validation/shows";
import { JOIN } from "./review-queries";

export const SHOWS_PER_PAGE = 50;

export interface ShowListRow {
  id: number;
  date: string;
  placeName: string | null;
  band: string | null;
  showType: string | null;
  setCount: number;
  segmentCount: number;
  placeId: number | null;
  bandId: number | null;
  /** The public page of the show, or null when it has none (no slug, or the show is private). */
  publicHref: string | null;
}

/** The records that a filter names, so the page can say what it filters by and link to them. */
export interface ShowListFilterNames {
  place: { id: number; name: string } | null;
  band: { id: number; name: string } | null;
  work: { id: number; name: string } | null;
}

export interface ShowList {
  filters: ShowListFilterNames;
  rows: ShowListRow[];
  total: number;
  page: number;
  pageCount: number;
}

/** The `where` for a search text: a date prefix (`1980`, `1980-11`, `1980-11-14`) or a place name. */
function searchWhere(query: string): Prisma.ShowWhereInput {
  const search = parseShowSearch(query);
  if (search.kind === "all") return {};
  if (search.kind === "date") {
    return {
      dateYear: search.year,
      ...(search.month !== null ? { dateMonth: search.month } : {}),
      ...(search.day !== null ? { dateDay: search.day } : {}),
    };
  }
  const match = { contains: search.text, mode: "insensitive" } as const;
  return { OR: [{ placeName: { name: match } }, { place: { names: { some: { name: match } } } }] };
}

/**
 * The shows that have a segment of a work. A show counts once, however many segments of the work
 * it has (a reprise, a medley that comes back to it): "every time played" counts shows (user,
 * 2026-11-27). The work page's count and the shows list both use this, so the numbers agree.
 */
export function showsWithWork(workId: number): Prisma.ShowWhereInput {
  return { sets: { some: { segments: { some: { workId } } } } };
}

/**
 * The `where` for the filters. A place filter includes the places inside it (HSA-185) unless
 * `direct` is set. A work filter finds the shows with a segment of that work.
 */
async function filterWhere(filter: ShowsFilter, db: PrismaClient): Promise<Prisma.ShowWhereInput> {
  const and: Prisma.ShowWhereInput[] = [];
  if (filter.place !== undefined) {
    and.push({ placeId: filter.direct ? filter.place : { in: await placeIdsInside(filter.place, db) } });
  }
  if (filter.band !== undefined) and.push({ bandId: filter.band });
  if (filter.work !== undefined) and.push(showsWithWork(filter.work));
  return and.length > 0 ? { AND: and } : {};
}

async function filterNames(filter: ShowsFilter, db: PrismaClient): Promise<ShowListFilterNames> {
  const [place, band, work] = await Promise.all([
    filter.place === undefined ? null : db.place.findUnique({ where: { id: filter.place }, select: { names: { orderBy: { position: "asc" }, take: 1, select: { name: true } } } }),
    filter.band === undefined ? null : db.band.findUnique({ where: { id: filter.band }, select: { name: true } }),
    filter.work === undefined ? null : db.work.findUnique({ where: { id: filter.work }, select: { title: true } }),
  ]);
  return {
    place: filter.place !== undefined && place ? { id: filter.place, name: place.names[0]?.name ?? `Place ${filter.place}` } : null,
    band: filter.band !== undefined && band ? { id: filter.band, name: band.name } : null,
    work: filter.work !== undefined && work ? { id: filter.work, name: work.title } : null,
  };
}

/**
 * One page of shows, newest first. A plain query: no trigram index work yet. Three queries
 * (the count, the shows, the sets with their segment counts), whatever the page holds.
 */
export async function listShows(
  query: string,
  page: number,
  db: PrismaClient = getPrisma(),
  sort: ShowSort = "newest",
  filter: ShowsFilter = {},
): Promise<ShowList> {
  const dir = sort === "newest" ? "desc" : "asc";
  const where: Prisma.ShowWhereInput = { AND: [searchWhere(query), await filterWhere(filter, db)] };
  const total = await db.show.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / SHOWS_PER_PAGE));
  const current = Math.min(Math.max(1, page), pageCount);
  const shows = await db.show.findMany({
    ...JOIN,
    where,
    orderBy: [
      { dateYear: { sort: dir, nulls: "last" } },
      { dateMonth: { sort: dir, nulls: "last" } },
      { dateDay: { sort: dir, nulls: "last" } },
      { orderOnDate: { sort: dir, nulls: "last" } },
      { id: dir },
    ],
    skip: (current - 1) * SHOWS_PER_PAGE,
    take: SHOWS_PER_PAGE,
    select: {
      id: true,
      placeId: true,
      bandId: true,
      dateYear: true,
      dateMonth: true,
      dateDay: true,
      dateAsWritten: true,
      slug: true,
      entity: { select: { isPublic: true } },
      placeName: { select: { name: true } },
      place: { select: { names: { orderBy: { position: "asc" }, take: 1, select: { name: true } } } },
      band: { select: { name: true } },
      showType: { select: { name: true } },
    },
  });
  const sets = await db.set.findMany({
    where: { showId: { in: shows.map((show) => show.id) } },
    select: { showId: true, _count: { select: { segments: true } } },
  });
  const counts = new Map<number, { sets: number; segments: number }>();
  for (const set of sets) {
    const entry = counts.get(set.showId) ?? { sets: 0, segments: 0 };
    counts.set(set.showId, { sets: entry.sets + 1, segments: entry.segments + set._count.segments });
  }
  const rows = shows.map((show) => ({
    id: show.id,
    date: shortDate(show),
    placeName: show.placeName?.name ?? show.place?.names[0]?.name ?? null,
    band: show.band?.name ?? null,
    placeId: show.placeId,
    bandId: show.bandId,
    showType: show.showType?.name ?? null,
    setCount: counts.get(show.id)?.sets ?? 0,
    segmentCount: counts.get(show.id)?.segments ?? 0,
    publicHref: show.entity.isPublic ? publicHref("Show", show.slug) : null,
  }));
  return { filters: await filterNames(filter, db), rows, total, page: current, pageCount };
}
