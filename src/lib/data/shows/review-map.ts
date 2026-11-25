import { describeRecord, segmentLabel, setLabel } from "@/lib/changes/labels";
import { typeOfKind } from "@/lib/data/changes/describe";
import {
  certaintyNote,
  certaintyWords,
  cutWords,
  deliveryWords,
  enumWords,
  extentWords,
  joinMark,
  shortDate,
} from "@/lib/shows/review-words";
import type { OriginLookup } from "./review-origin";
import type { CitationRow, NoteRow, ReferenceRow, SegmentRow, SetRow, ShowRow } from "./review-queries";
import type {
  ReviewAttachments,
  ReviewCitation,
  ReviewLine,
  ReviewNote,
  ReviewReference,
  ReviewSegment,
} from "./review-types";

type DateRow = Parameters<typeof shortDate>[0];
type PlaceWithNames = { names: Array<{ name: string }> } | null;

/** The first name of a place (lowest position), which is the default name for a show. */
export function placeNameOf(place: PlaceWithNames): string | null {
  return place?.names[0]?.name ?? null;
}

function showLabel(show: DateRow & { placeName?: { name: string } | null; place?: PlaceWithNames }): string {
  const where = show.placeName?.name ?? placeNameOf(show.place ?? null);
  return `Show ${[shortDate(show), where].filter(Boolean).join(", ")}`;
}

/** The target of a reference by name, with the admin page when it has one. */
export function describeTarget(to: ReferenceRow["to"], pageShowId?: number): { name: string; href: string | null } {
  if (to.show) return { name: showLabel(to.show), href: `/admin/shows/${to.id}` };
  // A set or segment of the page's own show leaves the show's date out: the page header says it.
  const dateIn = (showId: number, show: DateRow) => (showId === pageShowId ? null : shortDate(show));
  if (to.set) {
    const name = setLabel({ position: to.set.position }, dateIn(to.set.showId, to.set.show)) ?? "Set";
    return { name, href: `/admin/shows/${to.set.showId}#set-${to.id}` };
  }
  if (to.segment) {
    const { set, work, summary } = to.segment;
    const name = segmentLabel(work?.title ?? null, dateIn(set.showId, set.show), { summary });
    return { name, href: `/admin/shows/${set.showId}#segment-${to.id}` };
  }
  const named =
    to.work?.title ??
    to.person?.name ??
    to.band?.name ??
    placeNameOf(to.place) ??
    to.placeName?.name ??
    to.source?.title ??
    (to.recording
      ? (to.recording.description ??
        (to.recording.showId === pageShowId ? "Recording of this show" : `Recording of the show on ${shortDate(to.recording.show)}`))
      : null) ??
    to.subject?.name ??
    to.guidePage?.title ??
    to.version?.name ??
    to.showGroup?.name ??
    to.period?.name ??
    to.variant?.name ??
    to.passage?.label;
  if (named) return { name: `${enumWords(to.kind)} "${named}"`, href: null };
  // A kind with no name field reads by the shared label helper: its type and ID.
  return { name: describeRecord(typeOfKind(to.kind) ?? enumWords(to.kind), { id: to.id }), href: null };
}

export interface Maps {
  /** The show of the page. */
  showId: number;
  /** How many recordings the show has: a citation names its recording only when there are several. */
  ownRecordings: number;
  origin: OriginLookup;
  references: Map<number, ReferenceRow[]>;
  citations: Map<number, CitationRow[]>;
  notes: Map<number, NoteRow[]>;
}

export function groupBy<T>(items: T[], key: (item: T) => number): Map<number, T[]> {
  const out = new Map<number, T[]>();
  for (const item of items) {
    const k = key(item);
    out.set(k, [...(out.get(k) ?? []), item]);
  }
  return out;
}

function mapReference(row: ReferenceRow, maps: Maps): ReviewReference {
  const target = describeTarget(row.to, maps.showId);
  return {
    key: `reference-${row.id}`,
    kind: row.referenceKind.name,
    target: target.name,
    href: target.href,
    certainty: certaintyWords(row.certainty),
    note: row.note,
    origin: maps.origin("Reference", row.id),
  };
}

function mapCitation(row: CitationRow, maps: Maps): ReviewCitation {
  // A recording of this same show reads short: only what is specific (its time on the tape).
  const own = row.recording && row.recording.showId === maps.showId ? row.recording : null;
  let by: string;
  let place = row.place;
  if (own) {
    const named = maps.ownRecordings > 1 && own.description ? ` "${own.description}"` : "";
    by = `This show's recording${named}${place ? `, ${place}` : ""}`;
    place = null;
  } else if (row.source) by = `Source "${row.source.title}"`;
  else if (row.recording) by = `Recording "${row.recording.description ?? `of the show on ${shortDate(row.recording.show)}`}"`;
  else if (row.contributor) by = `Contributor ${row.contributor.name}`;
  else by = "Unnamed evidence";
  return {
    key: `citation-${row.id}`,
    by,
    aspect: row.aspect ? enumWords(row.aspect) : null,
    place,
    note: row.note,
    excerpt: row.excerpt,
    origin: maps.origin("Citation", row.id),
  };
}

function mapNote(row: NoteRow, maps: Maps): ReviewNote {
  return { key: `note-${row.note.id}`, body: row.note.body, isPublic: row.note.isPublic, origin: maps.origin("Note", row.note.id) };
}

export function attachmentsOf(entityId: number, maps: Maps): ReviewAttachments {
  return {
    references: (maps.references.get(entityId) ?? []).map((row) => mapReference(row, maps)),
    citations: (maps.citations.get(entityId) ?? []).map((row) => mapCitation(row, maps)),
    notes: (maps.notes.get(entityId) ?? []).map((row) => mapNote(row, maps)),
  };
}

type LineupRow = ShowRow["lineup"][number];

export function lineupLines(rows: LineupRow[], origin: OriginLookup): ReviewLine[] {
  return rows.map((row) => {
    const notes = [
      row.instruments.map((i) => i.instrument.name).join(", "),
      row.absent ? "absent" : "",
      row.sings ? "sings" : "",
      row.memberOverride ? `marked as ${row.memberOverride.toLowerCase()} by hand` : "",
    ].filter(Boolean);
    return {
      key: `lineup-${row.id}`,
      text: `${row.person.name}${notes.length ? `: ${notes.join("; ")}` : ""}`,
      origin: origin("LineupEntry", row.id),
    };
  });
}

function vocalLines(row: SegmentRow, origin: OriginLookup): ReviewLine[] {
  return row.vocals.map((vocal) => {
    const parts = [
      `${vocal.person?.name ?? "Singer not known"}, ${vocal.role.toLowerCase()}`,
      deliveryWords(vocal.delivery),
      vocal.passage?.label,
      vocal.scopeNote,
    ].filter(Boolean);
    return { key: `vocal-${vocal.id}`, text: parts.join("; "), origin: origin("VocalEntry", vocal.id) };
  });
}

function workTitle(row: SegmentRow): string {
  if (row.work) return `${row.work.title}${certaintyNote(row.workCertainty)}`;
  if (row.delivery === "SPOKEN") return "Talk";
  if (row.delivery === "RECORDING_PLAYED") return "Recording played";
  return "Unknown song";
}

function mapSegment(row: SegmentRow, number: string, depth: number, maps: Maps): ReviewSegment {
  return {
    id: row.id,
    rev: row.rev,
    number,
    depth,
    origin: maps.origin("Segment", row.id),
    work: workTitle(row),
    delivery: deliveryWords(row.delivery),
    wordsFrom: row.wordsFromWork ? `${row.wordsFromWork.title}${certaintyNote(row.wordsFromCertainty)}` : null,
    tuneFrom: row.tuneFromWork ? `${row.tuneFromWork.title}${certaintyNote(row.tuneFromCertainty)}` : null,
    extent: extentWords(row.extent),
    portionNote: row.portionNote,
    cuts: cutWords(row),
    deliveredBy: row.deliveredBy ? `${row.deliveredBy.name}${certaintyNote(row.deliveredByCertainty)}` : null,
    joinMark: joinMark(row.joinsNext),
    summary: row.summary,
    wordsAsHeard: row.wordsAsHeard,
    wordsPublic: row.wordsPublic,
    vocals: vocalLines(row, maps.origin),
    lineup: lineupLines(row.lineup, maps.origin),
    attachments: attachmentsOf(row.id, maps),
  };
}

/** The segments of one set in reading order: children follow their parent, indented by depth. */
export function mapSegments(rows: SegmentRow[], maps: Maps): ReviewSegment[] {
  const ids = new Set(rows.map((row) => row.id));
  const children = groupBy(
    rows.filter((row) => row.parentId !== null && ids.has(row.parentId)),
    (row) => row.parentId as number,
  );
  const out: ReviewSegment[] = [];
  const walk = (row: SegmentRow, number: string, depth: number) => {
    out.push(mapSegment(row, number, depth, maps));
    (children.get(row.id) ?? []).forEach((child, index) => walk(child, `${number}.${index + 1}`, depth + 1));
  };
  rows
    .filter((row) => row.parentId === null || !ids.has(row.parentId))
    .forEach((row, index) => walk(row, String(index + 1), 0));
  return out;
}

export function setTypeName(set: SetRow): string {
  return set.setType.displayName || set.setType.name;
}
