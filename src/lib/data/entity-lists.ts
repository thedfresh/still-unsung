import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { countShowsInPlace } from "@/lib/data/places";
import { showsWithWork } from "@/lib/data/shows/list";
import { DEFAULT_PLACE_TYPE, ENTITIES_PER_PAGE, type EntityKind, type EntitySort } from "@/lib/entity-lists";
import { adminHref, showsListHref } from "@/lib/record-links";
import { compareNames } from "@/lib/sort-name";

export interface EntityRow {
  id: number;
  name: string;
  /** One short line under the name, or null. */
  detail: string | null;
  updatedAt: Date;
}

export interface EntityList {
  rows: EntityRow[];
  total: number;
  page: number;
  pageCount: number;
}

type Loader = (db: PrismaClient, q: string, type: string) => Promise<EntityRow[]>;

const match = (q: string) => ({ contains: q, mode: "insensitive" }) as const;

const LOADERS: Record<EntityKind, Loader> = {
  works: async (db, q) => {
    const rows = await db.work.findMany({
      where: q ? { OR: [{ title: match(q) }, { otherNames: { has: q } }] } : {},
      select: { id: true, title: true, titleStatus: true, workKind: { select: { name: true } }, updatedAt: true },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.title,
      detail: [row.workKind.name, row.titleStatus === "WORKING_TITLE" ? "working title" : null].filter(Boolean).join(", "),
      updatedAt: row.updatedAt,
    }));
  },
  people: async (db, q) => {
    const rows = await db.person.findMany({
      where: q ? { OR: [{ name: match(q) }, { key: match(q) }, { otherNames: { has: q } }] } : {},
      select: { id: true, name: true, key: true, updatedAt: true },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, detail: `Key: ${row.key}`, updatedAt: row.updatedAt }));
  },
  bands: async (db, q) => {
    const rows = await db.band.findMany({
      where: q ? { OR: [{ name: match(q) }, { displayName: match(q) }] } : {},
      select: { id: true, name: true, displayName: true, updatedAt: true },
    });
    return rows.map((row) => ({ id: row.id, name: row.name, detail: row.displayName, updatedAt: row.updatedAt }));
  },
  places: async (db, q, type) => {
    // All places in one query (a few hundred rows): each row shows its full path (venue, city,
    // region, country), and the search also matches the places it is in ("Olympia" finds the
    // venues in Olympia). Venues by default; `type` picks another kind, "all" or "none".
    const rows = await db.place.findMany({
      select: {
        id: true,
        parentId: true,
        updatedAt: true,
        placeKind: { select: { name: true } },
        names: { orderBy: { position: "asc" }, select: { name: true } },
      },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const nameOf = (row: (typeof rows)[number]) => row.names[0]?.name ?? `Place ${row.id}`;
    const ancestors = (row: (typeof rows)[number]): string[] => {
      const out: string[] = [];
      const seen = new Set([row.id]);
      for (let up = row.parentId === null ? undefined : byId.get(row.parentId); up && !seen.has(up.id); up = up.parentId === null ? undefined : byId.get(up.parentId)) {
        seen.add(up.id);
        out.push(nameOf(up));
      }
      return out;
    };
    const wanted = type || DEFAULT_PLACE_TYPE;
    const needle = q.toLowerCase();
    return rows
      .filter((row) => (wanted === "all" ? true : wanted === "none" ? !row.placeKind : row.placeKind?.name.toLowerCase() === wanted))
      .map((row) => ({ row, path: ancestors(row) }))
      .filter(({ row, path }) => !needle || [...row.names.map((n) => n.name), ...path].some((text) => text.toLowerCase().includes(needle)))
      .map(({ row, path }) => ({
        id: row.id,
        name: nameOf(row),
        detail:
          [
            path.length > 0 ? path.join(", ") : null,
            // The kind only in the "all places" list: elsewhere the filter already says it.
            wanted === "all" ? (row.placeKind?.name ?? "no kind") : null,
            row.names.length > 1 ? `Also: ${row.names.slice(1).map((n) => n.name).join(", ")}` : null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        updatedAt: row.updatedAt,
      }));
  },
};

/** Put rows in order. Names sort without a leading "The", "A" or "An". */
export function sortRows(rows: EntityRow[], sort: EntitySort): EntityRow[] {
  const copy = [...rows];
  if (sort === "recent") return copy.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || a.id - b.id);
  copy.sort((a, b) => compareNames(a.name, b.name) || a.id - b.id);
  return sort === "name-desc" ? copy.reverse() : copy;
}

/**
 * One page of a catalogue list. One query finds the matches (names only), then the sort and the
 * page cut run in code, because the sort ignores a leading article and no column holds that form.
 */
export async function listEntities(kind: EntityKind, q: string, sort: EntitySort, page: number, type = "", db: PrismaClient = getPrisma()): Promise<EntityList> {
  const all = sortRows(await LOADERS[kind](db, q, type), sort);
  const pageCount = Math.max(1, Math.ceil(all.length / ENTITIES_PER_PAGE));
  const current = Math.min(Math.max(1, page), pageCount);
  return { rows: all.slice((current - 1) * ENTITIES_PER_PAGE, current * ENTITIES_PER_PAGE), total: all.length, page: current, pageCount };
}

const DELEGATE = { works: "work", people: "person", bands: "band", places: "place" } as const;

/** The choices of the places list's kind filter: venues first, then the other kinds, all, none. */
export async function placeTypeOptions(db: PrismaClient = getPrisma()): Promise<Array<{ value: string; label: string }>> {
  const kinds = await db.placeKind.findMany({ orderBy: { position: "asc" }, select: { name: true } });
  const plural = (name: string) => (name.endsWith("y") ? `${name.slice(0, -1)}ies` : `${name}s`);
  const label = (name: string) => plural(name).replace(/^./, (c) => c.toUpperCase());
  const names = kinds.map((k) => k.name.toLowerCase());
  const ordered = names.includes(DEFAULT_PLACE_TYPE) ? [DEFAULT_PLACE_TYPE, ...names.filter((n) => n !== DEFAULT_PLACE_TYPE)] : names;
  return [...ordered.map((n) => ({ value: n, label: label(n) })), { value: "all", label: "All places" }, { value: "none", label: "No kind set" }];
}

/** True when a record of this kind and ID exists: one small query, for the proxy's 404. */
export async function entityExists(kind: EntityKind, id: number, db: PrismaClient = getPrisma()): Promise<boolean> {
  const delegate = db[DELEGATE[kind]] as unknown as { count(args: object): Promise<number> };
  return (await delegate.count({ where: { id } })) > 0;
}

/** A fact value: plain text, or text that links to a page (HSA-186). */
export type FactValue = string | { text: string; href: string; /** What the link opens, for a screen reader (WCAG link purpose). */ opens?: string };

export interface EntityDetail {
  title: string;
  /** Label and value. A value of null is left out. */
  facts: Array<[string, FactValue | null]>;
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");
const countOf = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

/** A read-only view of one record for its admin page. Admins may see private fields. */
export async function getEntityDetail(kind: EntityKind, id: number, db: PrismaClient = getPrisma()): Promise<EntityDetail | null> {
  if (kind === "works") {
    const row = await db.work.findUnique({
      where: { id },
      include: { workKind: { select: { name: true } } },
    });
    if (!row) return null;
    const shows = await db.show.count({ where: showsWithWork(id) });
    return {
      title: row.title,
      facts: [
        ["Title", row.title],
        ["Other names", row.otherNames.join("; ") || null],
        ["Kind", row.workKind.name],
        ["Title status", row.titleStatus === "WORKING_TITLE" ? "Working title" : "Known"],
        ["Default delivery", row.defaultDelivery?.toLowerCase().replaceAll("_", " ") ?? null],
        // Counted in shows, not segments: a show with the work twice counts once. The count links
        // to the shows list with the same filter, so the numbers agree (HSA-186).
        ["Played in", { text: countOf(shows, "show"), href: showsListHref({ work: id }), opens: "the list of shows with this work" }],
      ],
    };
  }
  if (kind === "people") {
    const row = await db.person.findUnique({ where: { id } });
    if (!row) return null;
    return {
      title: row.name,
      facts: [
        ["Name", row.name],
        ["First name", row.firstName],
        ["Last name", row.lastName],
        ["Key", row.key],
        ["Other names", row.otherNames.join("; ") || null],
        ["Email (private)", row.email],
      ],
    };
  }
  if (kind === "bands") {
    const row = await db.band.findUnique({ where: { id }, include: { _count: { select: { shows: true } } } });
    if (!row) return null;
    return {
      title: row.name,
      facts: [
        ["Name", row.name],
        ["Display name", row.displayName],
        ["Hunter's own band", yesNo(row.isHunterBand)],
        ["Billed at", { text: countOf(row._count.shows, "show"), href: showsListHref({ band: id }), opens: "the list of shows of this band" }],
      ],
    };
  }
  const row = await db.place.findUnique({
    where: { id },
    include: {
      names: { orderBy: { position: "asc" }, select: { name: true } },
      placeKind: { select: { name: true } },
      parent: { select: { id: true, names: { orderBy: { position: "asc" }, take: 1, select: { name: true } } } },
    },
  });
  if (!row) return null;
  const shows = await countShowsInPlace(id, db);
  const inside = row.parent ? { text: row.parent.names[0]?.name ?? `Place ${row.parent.id}`, href: adminHref("Place", row.parent.id) ?? "" } : null;
  return {
    title: row.names[0]?.name ?? `Place ${row.id}`,
    facts: [
      ["Names", row.names.map((n) => n.name).join("; ") || null],
      ["Kind", row.placeKind?.name ?? null],
      ["Inside", inside],
      // Roll-up (HSA-185): a city or region counts the shows at the places inside it. Each count
      // links to the shows list with the same filter (HSA-186).
      ["Shows here and inside", { text: countOf(shows.inside, "show"), href: showsListHref({ place: id }), opens: "the list of shows here and inside" }],
      ["Shows attached here", { text: countOf(shows.direct, "show"), href: showsListHref({ place: id, direct: true }), opens: "the list of shows attached here" }],
    ],
  };
}
