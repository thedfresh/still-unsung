import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import type { EditChoice } from "@/lib/shows/edit-types";

export const PICKER_KINDS = ["work", "place", "band", "person"] as const;
export type PickerKind = (typeof PICKER_KINDS)[number];

/** One result of a record search, for a picker. */
export interface PickerChoice {
  id: number;
  label: string;
  /** A short line under the label: a work's variants, a place's other names. */
  hint: string | null;
  /** For a place: its names in position order, so the show can pick one. */
  names?: EditChoice[];
}

const LIMIT = 15;
const match = (q: string) => ({ contains: q, mode: "insensitive" }) as const;

/**
 * The IDs of the works or people with an other name that holds the text, ignoring case. Prisma
 * has no part-match on a text list, so this is one parameterised query. The characters `%`, `_`
 * and backslash in the text match themselves.
 */
async function idsByOtherName(db: PrismaClient, table: "works" | "people", text: string): Promise<number[]> {
  const pattern = `%${text.replace(/[\\%_]/g, "\\$&")}%`;
  const rows =
    table === "works"
      ? await db.$queryRaw<{ id: number }[]>`SELECT w.id FROM works w WHERE EXISTS (SELECT 1 FROM unnest(w."otherNames") AS o WHERE o ILIKE ${pattern}) LIMIT 200`
      : await db.$queryRaw<{ id: number }[]>`SELECT p.id FROM people p WHERE EXISTS (SELECT 1 FROM unnest(p."otherNames") AS o WHERE o ILIKE ${pattern}) LIMIT 200`;
  return rows.map((row) => row.id);
}

/** The most variant names shown with a work: enough to tell works apart, not a list. */
const VARIANT_LIMIT = 6;

/**
 * Search records by name for a picker (works by title or other name; places by any name;
 * bands and people by name). At most 15 results. The caller has already checked the sign-in.
 */
export async function searchPicker(kind: PickerKind, q: string, db: PrismaClient = getPrisma()): Promise<PickerChoice[]> {
  const text = q.trim();
  if (kind === "work") {
    const byOtherName = text ? await idsByOtherName(db, "works", text) : [];
    const rows = await db.work.findMany({
      where: text ? { OR: [{ title: match(text) }, { id: { in: byOtherName } }] } : {},
      orderBy: { title: "asc" },
      take: LIMIT,
      select: { id: true, title: true, versions: { select: { variants: { orderBy: { name: "asc" }, select: { name: true } } } } },
    });
    return rows.map((row) => {
      const variants = [...new Set(row.versions.flatMap((version) => version.variants.map((variant) => variant.name)))];
      const shown = variants.slice(0, VARIANT_LIMIT).join(", ");
      return {
        id: row.id,
        label: row.title,
        hint: variants.length === 0 ? null : `Variants: ${shown}${variants.length > VARIANT_LIMIT ? ", …" : ""}`,
      };
    });
  }
  if (kind === "place") {
    const rows = await db.place.findMany({
      where: text ? { names: { some: { name: match(text) } } } : {},
      take: LIMIT,
      select: { id: true, names: { orderBy: { position: "asc" }, select: { id: true, name: true } } },
    });
    return rows
      .map((row) => ({
        id: row.id,
        label: row.names[0]?.name ?? `Place ${row.id}`,
        hint: row.names.length > 1 ? `Also: ${row.names.slice(1).map((n) => n.name).join(", ")}` : null,
        names: row.names.map((n) => ({ id: n.id, label: n.name })),
      }))
      .sort((a, b) => a.label.localeCompare(b.label, "en"));
  }
  if (kind === "band") {
    const rows = await db.band.findMany({ where: text ? { name: match(text) } : {}, orderBy: { name: "asc" }, take: LIMIT, select: { id: true, name: true } });
    return rows.map((row) => ({ id: row.id, label: row.name, hint: null }));
  }
  const byOtherName = text ? await idsByOtherName(db, "people", text) : [];
  const rows = await db.person.findMany({
    where: text ? { OR: [{ name: match(text) }, { id: { in: byOtherName } }] } : {},
    orderBy: { name: "asc" },
    take: LIMIT,
    select: { id: true, name: true },
  });
  return rows.map((row) => ({ id: row.id, label: row.name, hint: null }));
}
