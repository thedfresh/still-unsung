import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";
import { dateInWords, shortDate, showStatusWords, certaintyNote } from "@/lib/shows/review-words";
import { attachmentsOf, groupBy, lineupLines, mapSegments, placeNameOf, setTypeName, type Maps } from "./review-map";
import { loadOrigins, type OriginType } from "./review-origin";
import { loadCitations, loadNotes, loadReferences, loadSegments, loadSets, loadShow, type ShowRow } from "./review-queries";
import type { ReviewLine, ReviewSet, ReviewShow } from "./review-types";

function showLines(show: ShowRow, origin: Maps["origin"]): Pick<ReviewShow, "bill" | "recordings" | "lineup"> {
  return {
    bill: show.bill.map((entry): ReviewLine => {
      const name = entry.actBand?.name ?? entry.actPerson?.name ?? "Unnamed act";
      return {
        key: `bill-${entry.id}`,
        text: `${entry.role.toLowerCase().replaceAll("_", "-")}: ${name}${certaintyNote(entry.certainty)}`,
        origin: origin("BillEntry", entry.id),
      };
    }),
    recordings: show.recordings.map((rec): ReviewLine => {
      const parts = [rec.recordingType?.name ?? "Recording", rec.description ?? "no description"];
      if (rec.lengthMinutes !== null) parts.push(`${rec.lengthMinutes} minutes`);
      if (!rec.inCirculation) parts.push("not in circulation");
      return { key: `recording-${rec.id}`, text: parts.join("; "), origin: origin("Recording", rec.id) };
    }),
    lineup: lineupLines(show.lineup, origin),
  };
}

/** True when a show with this ID exists: one small query, for the proxy's 404. */
export async function showExists(id: number, db: PrismaClient = getPrisma()): Promise<boolean> {
  return (await db.show.count({ where: { id } })) > 0;
}

/**
 * Everything about one show for the review page, in reading order. It runs a fixed number of
 * queries (seven), whatever the number of sets and segments: show, sets, segments, references,
 * citations, notes and origins. Returns null when the show does not exist.
 */
export async function getShowReview(id: number, db: PrismaClient = getPrisma()): Promise<ReviewShow | null> {
  const show = await loadShow(db, id);
  if (!show) return null;
  const sets = await loadSets(db, id);
  const segments = await loadSegments(
    db,
    sets.map((set) => set.id),
  );
  // Show, sets and segments share one ID space (the shared record ID), so one list serves all three lookups.
  const entityIds = [id, ...sets.map((set) => set.id), ...segments.map((segment) => segment.id)];
  const [references, citations, notes] = await Promise.all([
    loadReferences(db, entityIds),
    loadCitations(db, entityIds),
    loadNotes(db, entityIds),
  ]);

  const wanted = new Map<OriginType, number[]>([
    ["Show", [id]],
    ["Set", sets.map((set) => set.id)],
    ["Segment", segments.map((segment) => segment.id)],
    ["VocalEntry", segments.flatMap((segment) => segment.vocals.map((v) => v.id))],
    ["LineupEntry", [show, ...sets, ...segments].flatMap((row) => row.lineup.map((entry) => entry.id))],
    ["BillEntry", show.bill.map((entry) => entry.id)],
    ["Recording", show.recordings.map((rec) => rec.id)],
    ["Reference", references.map((row) => row.id)],
    ["Citation", citations.map((row) => row.id)],
    ["Note", notes.map((row) => row.note.id)],
  ]);
  const origins = await loadOrigins(db, wanted, id);
  const maps: Maps = {
    showId: id,
    ownRecordings: show.recordings.length,
    origin: origins.lookup,
    references: groupBy(references, (row) => row.fromId),
    citations: groupBy(citations, (row) => row.entityId),
    notes: groupBy(notes, (row) => row.entityId),
  };

  const segmentsBySet = groupBy(segments, (segment) => segment.setId);
  const reviewSets = sets.map(
    (set): ReviewSet => ({
      id: set.id,
      position: set.position,
      setType: setTypeName(set),
      incompleteReason: set.incompleteReason?.name ?? null,
      band: set.band?.name ?? null,
      origin: maps.origin("Set", set.id),
      lineup: lineupLines(set.lineup, maps.origin),
      attachments: attachmentsOf(set.id, maps),
      segments: mapSegments(segmentsBySet.get(set.id) ?? [], maps),
    }),
  );

  const placeName = show.placeName?.name ?? placeNameOf(show.place);
  return {
    id,
    title: `Show ${[shortDate(show), placeName].filter(Boolean).join(", ")}`,
    // The one origin line of the page: the change that created the show itself.
    origin: origins.main,
    date: dateInWords(show),
    place: show.place ? `${placeNameOf(show.place) ?? "Place with no name"}${certaintyNote(show.placeCertainty)}` : null,
    placeName: show.placeName?.name ?? null,
    billedAs: show.billedAs,
    band: show.band?.name ?? null,
    showType: show.showType?.name ?? null,
    status:
      show.status === "TOOK_PLACE" && certaintyNote(show.statusCertainty) === ""
        ? null
        : `${showStatusWords(show.status)}${certaintyNote(show.statusCertainty)}`,
    timeLabel: show.timeLabel,
    ...showLines(show, maps.origin),
    attachments: attachmentsOf(id, maps),
    sets: reviewSets,
  };
}
