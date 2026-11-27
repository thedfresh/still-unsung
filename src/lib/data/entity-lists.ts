import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { ENTITIES_PER_PAGE, type EntityKind, type EntitySort } from "@/lib/entity-lists";
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

type Loader = (db: PrismaClient, q: string) => Promise<EntityRow[]>;

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
  places: async (db, q) => {
    const rows = await db.place.findMany({
      where: q ? { names: { some: { name: match(q) } } } : {},
      select: {
        id: true,
        updatedAt: true,
        placeKind: { select: { name: true } },
        names: { orderBy: { position: "asc" }, select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      // The first name (lowest position) is the one the list shows. A place with no name is still listed.
      name: row.names[0]?.name ?? `Place ${row.id}`,
      detail: [row.placeKind?.name, row.names.length > 1 ? `Also: ${row.names.slice(1).map((n) => n.name).join(", ")}` : null]
        .filter(Boolean)
        .join(". ") || null,
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
export async function listEntities(kind: EntityKind, q: string, sort: EntitySort, page: number, db: PrismaClient = getPrisma()): Promise<EntityList> {
  const all = sortRows(await LOADERS[kind](db, q), sort);
  const pageCount = Math.max(1, Math.ceil(all.length / ENTITIES_PER_PAGE));
  const current = Math.min(Math.max(1, page), pageCount);
  return { rows: all.slice((current - 1) * ENTITIES_PER_PAGE, current * ENTITIES_PER_PAGE), total: all.length, page: current, pageCount };
}

const DELEGATE = { works: "work", people: "person", bands: "band", places: "place" } as const;

/** True when a record of this kind and ID exists: one small query, for the proxy's 404. */
export async function entityExists(kind: EntityKind, id: number, db: PrismaClient = getPrisma()): Promise<boolean> {
  const delegate = db[DELEGATE[kind]] as unknown as { count(args: object): Promise<number> };
  return (await delegate.count({ where: { id } })) > 0;
}

export interface EntityDetail {
  title: string;
  /** Label and value. A value of null is left out. */
  facts: Array<[string, string | null]>;
}

const yesNo = (value: boolean) => (value ? "Yes" : "No");

/** A read-only view of one record for its admin page. Admins may see private fields. */
export async function getEntityDetail(kind: EntityKind, id: number, db: PrismaClient = getPrisma()): Promise<EntityDetail | null> {
  if (kind === "works") {
    const row = await db.work.findUnique({
      where: { id },
      include: { workKind: { select: { name: true } }, _count: { select: { segments: true } } },
    });
    if (!row) return null;
    return {
      title: row.title,
      facts: [
        ["Title", row.title],
        ["Other names", row.otherNames.join("; ") || null],
        ["Kind", row.workKind.name],
        ["Title status", row.titleStatus === "WORKING_TITLE" ? "Working title" : "Known"],
        ["Default delivery", row.defaultDelivery?.toLowerCase().replaceAll("_", " ") ?? null],
        ["Played in", `${row._count.segments} ${row._count.segments === 1 ? "segment" : "segments"}`],
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
        ["Billed at", `${row._count.shows} ${row._count.shows === 1 ? "show" : "shows"}`],
      ],
    };
  }
  const row = await db.place.findUnique({
    where: { id },
    include: {
      names: { orderBy: { position: "asc" }, select: { name: true } },
      placeKind: { select: { name: true } },
      parent: { select: { names: { orderBy: { position: "asc" }, take: 1, select: { name: true } } } },
      _count: { select: { shows: true } },
    },
  });
  if (!row) return null;
  return {
    title: row.names[0]?.name ?? `Place ${row.id}`,
    facts: [
      ["Names", row.names.map((n) => n.name).join("; ") || null],
      ["Kind", row.placeKind?.name ?? null],
      ["Inside", row.parent?.names[0]?.name ?? null],
      ["Shows here", `${row._count.shows} ${row._count.shows === 1 ? "show" : "shows"}`],
    ],
  };
}
