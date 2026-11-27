import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import type { EditSegment, EditSet, ShowEditData } from "@/lib/shows/edit-types";
import { shortDate } from "@/lib/shows/review-words";
import { JOIN } from "./review-queries";

type SegmentRow = {
  id: number;
  rev: number;
  parentId: number | null;
  sortKey: string;
  delivery: string | null;
  extent: string;
  joinsNext: string;
  portionNote: string | null;
  summary: string | null;
  workId: number | null;
  work: { title: string } | null;
};

/**
 * The segments of one set in reading order: a container, then its children, each level by sort
 * key. Sort keys compare as bytes, as the database does. A segment whose parent is missing from
 * the set is shown at the top level, so nothing is lost.
 */
export function orderSegments(rows: SegmentRow[]): EditSegment[] {
  const ids = new Set(rows.map((row) => row.id));
  const children = new Map<number | null, SegmentRow[]>();
  for (const row of rows) {
    const parent = row.parentId !== null && ids.has(row.parentId) ? row.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), row]);
  }
  const out: EditSegment[] = [];
  const walk = (parent: number | null, depth: number, prefix: string) => {
    const list = (children.get(parent) ?? []).sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : a.id - b.id));
    list.forEach((row, index) => {
      const number = `${prefix}${index + 1}`;
      out.push({
        id: row.id,
        rev: row.rev,
        parentId: row.parentId,
        sortKey: row.sortKey,
        depth,
        number,
        workId: row.workId,
        workTitle: row.work?.title ?? null,
        delivery: row.delivery,
        extent: row.extent,
        joinsNext: row.joinsNext === "RUNS_INTO",
        portionNote: row.portionNote,
        summary: row.summary,
      });
      walk(row.id, depth + 1, `${number}.`);
    });
  };
  walk(null, 0, "");
  return out;
}

/** The sets in position order, each with its segments in reading order. */
function buildSets(
  sets: Array<{ id: number; rev: number; position: number; setTypeId: number; setType: { name: string; displayName: string } }>,
  segments: Array<SegmentRow & { setId: number }>,
): EditSet[] {
  return sets.map((set) => ({
    id: set.id,
    rev: set.rev,
    position: set.position,
    setTypeId: set.setTypeId,
    setTypeName: set.setType.displayName || set.setType.name,
    segments: orderSegments(segments.filter((s) => s.setId === set.id)),
  }));
}

/**
 * Everything the show editor shows, for one show: fields, bill, sets with their segments and
 * the show's notes (public and private). A fixed number of queries, whatever the number of
 * segments. Returns null when the show does not exist. The caller has already checked the sign-in.
 */
export async function getShowEditData(id: number, db: PrismaClient = getPrisma()): Promise<ShowEditData | null> {
  const show = await db.show.findUnique({
    ...JOIN,
    where: { id },
    select: {
      id: true,
      rev: true,
      dateYear: true,
      dateMonth: true,
      dateDay: true,
      dateAsWritten: true,
      placeNameId: true,
      billedAs: true,
      status: true,
      slug: true,
      entity: { select: { isPublic: true } },
      place: { select: { id: true, names: { orderBy: { position: "asc" }, select: { id: true, name: true } } } },
      placeName: { select: { name: true } },
      band: { select: { id: true, name: true } },
      bill: {
        orderBy: { position: "asc" },
        select: { id: true, rev: true, position: true, role: true, certainty: true, actBand: { select: { name: true } }, actPerson: { select: { name: true } } },
      },
    },
  });
  if (!show) return null;
  const [sets, setTypes, attachments] = await Promise.all([
    db.set.findMany({
      ...JOIN,
      where: { showId: id },
      orderBy: [{ position: "asc" }, { id: "asc" }],
      select: { id: true, rev: true, position: true, setTypeId: true, setType: { select: { name: true, displayName: true } } },
    }),
    db.setType.findMany({ orderBy: [{ position: "asc" }, { id: "asc" }], select: { id: true, name: true, displayName: true } }),
    db.noteAttachment.findMany({
      ...JOIN,
      where: { entityId: id },
      orderBy: { id: "asc" },
      select: { id: true, note: { select: { id: true, rev: true, body: true, isPublic: true, _count: { select: { attachments: true } } } } },
    }),
  ]);
  const segments = await db.segment.findMany({
    ...JOIN,
    where: { setId: { in: sets.map((set) => set.id) } },
    select: {
      id: true,
      rev: true,
      setId: true,
      parentId: true,
      sortKey: true,
      delivery: true,
      extent: true,
      joinsNext: true,
      portionNote: true,
      summary: true,
      workId: true,
      work: { select: { title: true } },
    },
  });
  const placeLabel = (names: string[]) => names[0] ?? "Unnamed place";
  return {
    id: show.id,
    rev: show.rev,
    title: `Show ${shortDate(show)}${show.placeName ? `, ${show.placeName.name}` : ""}`,
    year: show.dateYear,
    month: show.dateMonth,
    day: show.dateDay,
    dateAsWritten: show.dateAsWritten,
    place: show.place
      ? { id: show.place.id, label: placeLabel(show.place.names.map((n) => n.name)), names: show.place.names.map((n) => ({ id: n.id, label: n.name })) }
      : null,
    placeNameId: show.placeNameId,
    billedAs: show.billedAs,
    band: show.band ? { id: show.band.id, label: show.band.name } : null,
    status: show.status,
    bill: show.bill.map((entry) => ({
      id: entry.id,
      rev: entry.rev,
      position: entry.position,
      role: entry.role,
      certainty: entry.certainty,
      actName: entry.actBand?.name ?? entry.actPerson?.name ?? "Unnamed act",
    })),
    sets: buildSets(sets, segments),
    notes: attachments.map((row) => ({
      noteId: row.note.id,
      noteRev: row.note.rev,
      attachmentId: row.id,
      body: row.note.body,
      isPublic: row.note.isPublic,
      alsoAttachedTo: row.note._count.attachments - 1,
    })),
    setTypes: setTypes.map((type) => ({ id: type.id, label: type.displayName || type.name })),
    publicHref: show.slug && show.entity.isPublic ? `/shows/${show.slug}` : null,
  };
}
