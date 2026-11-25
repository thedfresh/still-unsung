import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { shortDate } from "@/lib/shows/review-words";
import { parseShowSearch } from "@/lib/shows/search";
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
}

export interface ShowList {
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
 * One page of shows, newest first. A plain query: no trigram index work yet. Three queries
 * (the count, the shows, the sets with their segment counts), whatever the page holds.
 */
export async function listShows(query: string, page: number, db: PrismaClient = getPrisma()): Promise<ShowList> {
  const where = searchWhere(query);
  const total = await db.show.count({ where });
  const pageCount = Math.max(1, Math.ceil(total / SHOWS_PER_PAGE));
  const current = Math.min(Math.max(1, page), pageCount);
  const shows = await db.show.findMany({
    ...JOIN,
    where,
    orderBy: [
      { dateYear: { sort: "desc", nulls: "last" } },
      { dateMonth: { sort: "desc", nulls: "last" } },
      { dateDay: { sort: "desc", nulls: "last" } },
      { orderOnDate: { sort: "desc", nulls: "last" } },
      { id: "desc" },
    ],
    skip: (current - 1) * SHOWS_PER_PAGE,
    take: SHOWS_PER_PAGE,
    select: {
      id: true,
      dateYear: true,
      dateMonth: true,
      dateDay: true,
      dateAsWritten: true,
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
    showType: show.showType?.name ?? null,
    setCount: counts.get(show.id)?.sets ?? 0,
    segmentCount: counts.get(show.id)?.segments ?? 0,
  }));
  return { rows, total, page: current, pageCount };
}
