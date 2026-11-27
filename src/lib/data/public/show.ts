import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { dropWithJoins } from "@/lib/shows/join-chain";
import { showStatusWords } from "@/lib/shows/review-words";
import {
  loadPublicNotes,
  loadPublicSegments,
  loadPublicSets,
  loadPublicShow,
  loadRecordingLinks,
  loadSegmentStructure,
  type PublicNoteRow,
  type PublicSegmentRow,
  type PublicShowRow,
  type RecordingLinkRow,
  type SegmentStructureRow,
} from "./show-queries";
import type {
  PublicNote,
  PublicRecording,
  PublicSegment,
  PublicSet,
  PublicShow,
  PublicShowLink,
} from "./show-types";
import { publicName } from "./visibility";

function groupNotes(rows: PublicNoteRow[]): Map<number, PublicNote[]> {
  const out = new Map<number, PublicNote[]>();
  for (const row of rows) out.set(row.entityId, [...(out.get(row.entityId) ?? []), row.note]);
  return out;
}

/** One segment with its children. A node is a structure row plus, for a public one, its details. */
interface Node {
  structure: SegmentStructureRow;
  detail: PublicSegmentRow | null;
  joinsNext: boolean;
}

/**
 * The public segments of one level, in order. Private segments drop out and the segue chain
 * carries across them. Children of a private segment are never reached, so they drop out too.
 */
function buildLevel(
  parentId: number | null,
  childrenOf: Map<number | null, SegmentStructureRow[]>,
  details: Map<number, PublicSegmentRow>,
  notes: Map<number, PublicNote[]>,
): PublicSegment[] {
  const nodes: Node[] = (childrenOf.get(parentId) ?? []).map((structure) => ({
    structure,
    detail: details.get(structure.id) ?? null,
    joinsNext: structure.joinsNext === "RUNS_INTO",
  }));
  return dropWithJoins(nodes, (node) => node.detail !== null && node.structure.entity.isPublic).map((node): PublicSegment => {
    const row = node.detail as PublicSegmentRow;
    return {
      id: row.id,
      workTitle: row.work && row.work.entity.isPublic ? row.work.title : null,
      workIsHidden: row.work !== null && !row.work.entity.isPublic,
      workCertainty: row.workCertainty,
      delivery: row.delivery,
      extent: row.extent,
      portionNote: row.portionNote,
      joinsNext: node.joinsNext,
      summary: row.summary,
      deliveredBy: publicName(row.deliveredBy),
      notes: notes.get(row.id) ?? [],
      children: buildLevel(row.id, childrenOf, details, notes),
    };
  });
}

function buildRecordings(show: PublicShowRow, links: RecordingLinkRow[]): PublicRecording[] {
  return show.recordings.map((rec): PublicRecording => ({
    id: rec.id,
    type: rec.recordingType?.name ?? null,
    description: rec.description,
    taper: publicName(rec.taper),
    lengthMinutes: rec.lengthMinutes,
    inCirculation: rec.inCirculation,
    links: links
      .filter((link) => link.entityId === rec.id && link.linkSystem.purpose !== "IDENTIFY" && link.linkSystem.purpose !== "READ")
      .flatMap((link) => {
        const url = (link.linkSystem.urlTemplate ?? "").replace("{value}", encodeURIComponent(link.value));
        // Only a secure web address becomes a link.
        return url.startsWith("https://") ? [{ label: link.linkSystem.name, url }] : [];
      }),
  }));
}

function buildBill(show: PublicShowRow): PublicShow["bill"] {
  return show.bill.flatMap((entry) => {
    const name = publicName(entry.actBand) ?? publicName(entry.actPerson);
    return name ? [{ id: entry.id, role: entry.role.toLowerCase().replaceAll("_", "-"), name, certainty: entry.certainty }] : [];
  });
}

function placeNameOf(show: PublicShowRow): string | null {
  if (show.placeNameId !== null) return publicName(show.placeName);
  return show.place && show.place.entity.isPublic ? (show.place.names[0]?.name ?? null) : null;
}

/**
 * Everything the public show page needs, by slug. Null when no public show has the slug. It
 * runs a fixed number of queries (seven at most), whatever the number of sets and segments.
 * Private records never leave this function: it selects public fields of public records only.
 */
export async function getPublicShow(slug: string, db: PrismaClient = getPrisma()): Promise<PublicShow | null> {
  const show = await loadPublicShow(db, slug);
  if (!show || show.slug === null) return null;
  const sets = await loadPublicSets(db, show.id);
  const structure = await loadSegmentStructure(
    db,
    sets.map((set) => set.id),
  );
  const publicIds = structure.filter((row) => row.entity.isPublic).map((row) => row.id);
  const [details, noteRows, linkRows] = await Promise.all([
    loadPublicSegments(db, publicIds),
    loadPublicNotes(db, [show.id, ...sets.map((set) => set.id), ...publicIds]),
    loadRecordingLinks(
      db,
      show.recordings.map((rec) => rec.id),
    ),
  ]);
  const notes = groupNotes(noteRows);
  const detailById = new Map(details.map((row) => [row.id, row]));

  const publicSets = sets.map((set): PublicSet => {
    const own = structure.filter((row) => row.setId === set.id);
    const childrenOf = new Map<number | null, SegmentStructureRow[]>();
    for (const row of own) childrenOf.set(row.parentId, [...(childrenOf.get(row.parentId) ?? []), row]);
    const bandName = publicName(set.band);
    return {
      id: set.id,
      label: set.setType.displayName || set.setType.name,
      band: bandName && bandName !== show.band?.name ? bandName : null,
      notes: notes.get(set.id) ?? [],
      segments: buildLevel(null, childrenOf, detailById, notes),
    };
  });

  return {
    id: show.id,
    slug: show.slug,
    date: {
      dateYear: show.dateYear,
      dateMonth: show.dateMonth,
      dateDay: show.dateDay,
      dateEndYear: show.dateEndYear,
      dateEndMonth: show.dateEndMonth,
      dateEndDay: show.dateEndDay,
      dateAsWritten: show.dateAsWritten,
      dateCertainty: show.dateCertainty,
    },
    timeLabel: show.timeLabel,
    placeName: placeNameOf(show),
    placeCertainty: show.placeCertainty,
    billedAs: show.billedAs,
    band:
      show.band && show.band.entity.isPublic
        ? { name: show.band.name, slug: show.band.slug, isHunterBand: show.band.isHunterBand }
        : null,
    statusWords:
      show.status === "TOOK_PLACE" && show.statusCertainty === "CONFIRMED"
        ? null
        : `${showStatusWords(show.status)}${show.statusCertainty === "CONFIRMED" ? "" : ` (${show.statusCertainty.toLowerCase()})`}`,
    bill: buildBill(show),
    notes: notes.get(show.id) ?? [],
    sets: publicSets,
    recordings: buildRecordings(show, linkRows),
    updatedAt: show.updatedAt,
  };
}

/** True when a public show has this slug: one small query, for the proxy's 404. */
export async function publicShowExists(slug: string, db: PrismaClient = getPrisma()): Promise<boolean> {
  return (await db.show.count({ where: { slug, entity: { isPublic: true } } })) > 0;
}

/**
 * The previous and the next public show in date order. A year-only date comes before every dated
 * show of that year, and shows of one date follow `orderOnDate`, then the ID (CONVENTIONS section 4).
 */
export async function getAdjacentPublicShows(
  id: number,
  db: PrismaClient = getPrisma(),
): Promise<{ prev: PublicShowLink | null; next: PublicShowLink | null }> {
  const columns = (alias: string) =>
    `COALESCE(${alias}."dateYear", 0), COALESCE(${alias}."dateMonth", 0), COALESCE(${alias}."dateDay", 0), COALESCE(${alias}."orderOnDate", 0), ${alias}.id`;
  const key = (alias: string) => Prisma.raw(`ROW(${columns(alias)})`);
  const subquery = Prisma.raw(`SELECT ${columns("c")} FROM shows c`);
  const find = async (before: boolean) => {
    const rows = await db.$queryRaw<{ slug: string }[]>(Prisma.sql`
      SELECT s.slug FROM shows s JOIN entities e ON e.id = s.id
      WHERE e."isPublic" AND s.slug IS NOT NULL
        AND ${key("s")} ${Prisma.raw(before ? "<" : ">")} (${subquery} WHERE c.id = ${id})
      ORDER BY COALESCE(s."dateYear", 0) ${Prisma.raw(before ? "DESC" : "ASC")},
               COALESCE(s."dateMonth", 0) ${Prisma.raw(before ? "DESC" : "ASC")},
               COALESCE(s."dateDay", 0) ${Prisma.raw(before ? "DESC" : "ASC")},
               COALESCE(s."orderOnDate", 0) ${Prisma.raw(before ? "DESC" : "ASC")},
               s.id ${Prisma.raw(before ? "DESC" : "ASC")}
      LIMIT 1`);
    return rows[0] ?? null;
  };
  const [prev, next] = await Promise.all([find(true), find(false)]);
  return { prev, next };
}
