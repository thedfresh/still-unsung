import { moveEdits } from "@/lib/lists/edits";
import { parsePartialDate } from "@/lib/partial-date";
import { keyBetween } from "@/lib/sort-key";
import type { EditBillEntry, EditNote, EditSegment, EditSet, ShowEditData } from "./edit-types";

/**
 * Builders for the edits of the show editor. Each one returns edits in the shape of the shared
 * admin save (docs/CONVENTIONS.md, section 12): the editor never writes its own save logic.
 * Pure functions: no database, no React.
 */
export interface Edit {
  op: "create" | "update" | "delete";
  type: string;
  id?: number;
  rev?: number;
  ref?: string;
  fields?: Record<string, unknown>;
}

export type Built = { edits: Edit[] } | { error: string };

const none: Built = { edits: [] };

/** The text of the show fields form. */
export interface ShowDraft {
  year: string;
  month: string;
  day: string;
  dateAsWritten: string;
  placeId: number | null;
  placeNameId: number | null;
  billedAs: string;
  bandId: number | null;
  status: string;
}

export function draftOfShow(show: ShowEditData): ShowDraft {
  return {
    year: show.year?.toString() ?? "",
    month: show.month?.toString() ?? "",
    day: show.day?.toString() ?? "",
    dateAsWritten: show.dateAsWritten ?? "",
    placeId: show.place?.id ?? null,
    placeNameId: show.placeNameId,
    billedAs: show.billedAs ?? "",
    bandId: show.band?.id ?? null,
    status: show.status,
  };
}

const textOrNull = (text: string) => (text.trim() === "" ? null : text.trim());

/** One update with the fields that changed. No edit when nothing changed. */
export function showFieldsEdit(show: ShowEditData, draft: ShowDraft): Built {
  const date = parsePartialDate(draft.year, draft.month, draft.day);
  if (!date.ok) return { error: date.error };
  const placeChanged = draft.placeId !== (show.place?.id ?? null);
  if (placeChanged && draft.placeId !== null && draft.placeNameId === null) return { error: "Pick one of the place's names." };
  const next: Record<string, unknown> = {
    dateYear: date.date.year,
    dateMonth: date.date.month,
    dateDay: date.date.day,
    dateAsWritten: textOrNull(draft.dateAsWritten),
    placeId: draft.placeId,
    placeNameId: draft.placeId === null ? null : draft.placeNameId,
    billedAs: textOrNull(draft.billedAs),
    bandId: draft.bandId,
    status: draft.status,
  };
  const old: Record<string, unknown> = {
    dateYear: show.year,
    dateMonth: show.month,
    dateDay: show.day,
    dateAsWritten: show.dateAsWritten,
    placeId: show.place?.id ?? null,
    placeNameId: show.placeNameId,
    billedAs: show.billedAs,
    bandId: show.band?.id ?? null,
    status: show.status,
  };
  const fields = Object.fromEntries(Object.entries(next).filter(([name, value]) => value !== old[name]));
  return Object.keys(fields).length === 0 ? none : { edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields }] };
}

// --- Sets ---

export function addSetEdit(show: Pick<ShowEditData, "id" | "sets">, setTypeId: number): Built {
  const position = show.sets.reduce((max, set) => Math.max(max, set.position), 0) + 1;
  return { edits: [{ op: "create", type: "Set", fields: { showId: show.id, position, setTypeId } }] };
}

export function setTypeEdit(set: EditSet, setTypeId: number): Built {
  if (set.setTypeId === setTypeId) return none;
  return { edits: [{ op: "update", type: "Set", id: set.id, rev: set.rev, fields: { setTypeId } }] };
}

export function moveSetEdits(sets: EditSet[], id: number, direction: -1 | 1): Built {
  return { edits: moveEdits({ type: "Set" }, sets, id, direction) as Edit[] };
}

// --- Segments ---

type Position = Pick<EditSegment, "id" | "rev" | "parentId" | "sortKey">;

/** The segments with one parent, in order. Sort keys compare as bytes, as the database does. */
export function siblingsOf<T extends Position>(segments: T[], parentId: number | null): T[] {
  return segments.filter((s) => s.parentId === parentId).sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
}

/** Where a new segment goes: the end of the set, after a segment, or inside a segment (at its end). */
export type Placement = { kind: "end" } | { kind: "after"; id: number } | { kind: "inside"; id: number };

export function parsePlacement(value: string): Placement {
  const [kind, id] = value.split(":");
  return (kind === "after" || kind === "inside") && Number(id) > 0 ? { kind, id: Number(id) } : { kind: "end" };
}

function place<T extends Position>(segments: T[], where: Placement): { parentId: number | null; sortKey: string } | { error: string } {
  const orderError = { error: "The segments of this set have equal or unordered sort keys. Ask for help." };
  try {
    if (where.kind === "end" || where.kind === "inside") {
      const parentId = where.kind === "end" ? null : where.id;
      const last = siblingsOf(segments, parentId).at(-1);
      return { parentId, sortKey: keyBetween(last?.sortKey ?? null, null) };
    }
    const target = segments.find((s) => s.id === where.id);
    if (!target) return { error: "The segment to place it after was not found." };
    const siblings = siblingsOf(segments, target.parentId);
    const next = siblings[siblings.findIndex((s) => s.id === target.id) + 1];
    return { parentId: target.parentId, sortKey: keyBetween(target.sortKey, next?.sortKey ?? null) };
  } catch {
    return orderError;
  }
}

/** The fields of a segment form. A blank work is an unknown song (or talk). */
export interface SegmentDraft {
  workId: number | null;
  delivery: string;
  extent: string;
  joinsNext: boolean;
  portionNote: string;
  summary: string;
}

/** A spoken segment has no extent or portion to state, so its form hides them (item 37). */
export const isSpoken = (delivery: string) => delivery === "SPOKEN";

export function draftOfSegment(segment: EditSegment): SegmentDraft {
  return {
    workId: segment.workId,
    delivery: segment.delivery ?? "",
    extent: segment.extent,
    joinsNext: segment.joinsNext,
    portionNote: segment.portionNote ?? "",
    summary: segment.summary ?? "",
  };
}

export const BLANK_SEGMENT: SegmentDraft = { workId: null, delivery: "", extent: "COMPLETE", joinsNext: false, portionNote: "", summary: "" };

/** A spoken segment keeps no extent or portion: the form hides them, so the save ignores them. */
function segmentValues(draft: SegmentDraft): Record<string, unknown> {
  const spoken = isSpoken(draft.delivery);
  return {
    workId: draft.workId,
    delivery: draft.delivery === "" ? null : draft.delivery,
    extent: spoken ? "COMPLETE" : draft.extent,
    joinsNext: draft.joinsNext ? "RUNS_INTO" : "STOPS",
    portionNote: spoken ? null : textOrNull(draft.portionNote),
    summary: textOrNull(draft.summary),
  };
}

export const SUMMARY_LIMIT = 300;

export function updateSegmentEdit(segment: EditSegment, draft: SegmentDraft): Built {
  if (draft.summary.trim().length > SUMMARY_LIMIT) return { error: `The summary may have at most ${SUMMARY_LIMIT} characters.` };
  const old: Record<string, unknown> = {
    workId: segment.workId,
    delivery: segment.delivery,
    extent: segment.extent,
    joinsNext: segment.joinsNext ? "RUNS_INTO" : "STOPS",
    portionNote: segment.portionNote,
    summary: segment.summary,
  };
  const fields = Object.fromEntries(Object.entries(segmentValues(draft)).filter(([name, value]) => value !== old[name]));
  return Object.keys(fields).length === 0 ? none : { edits: [{ op: "update", type: "Segment", id: segment.id, rev: segment.rev, fields }] };
}

export function addSegmentEdit(setId: number, segments: EditSegment[], where: Placement, draft: SegmentDraft): Built {
  if (draft.summary.trim().length > SUMMARY_LIMIT) return { error: `The summary may have at most ${SUMMARY_LIMIT} characters.` };
  const spot = place(segments, where);
  if ("error" in spot) return spot;
  const values = Object.fromEntries(Object.entries(segmentValues(draft)).filter(([, value]) => value !== null && value !== "STOPS" && value !== "COMPLETE"));
  const parent = spot.parentId === null ? {} : { parentId: spot.parentId };
  return { edits: [{ op: "create", type: "Segment", fields: { setId, sortKey: spot.sortKey, ...parent, ...values } }] };
}

function sortKeyUpdate(segment: Position, fields: Record<string, unknown>): Built {
  return { edits: [{ op: "update", type: "Segment", id: segment.id, rev: segment.rev, fields }] };
}

/** Move a segment one place up or down among its siblings. It changes only its own sort key. */
export function moveSegmentEdit(segments: EditSegment[], id: number, direction: -1 | 1): Built {
  const target = segments.find((s) => s.id === id);
  if (!target) return none;
  const siblings = siblingsOf(segments, target.parentId);
  const at = siblings.findIndex((s) => s.id === id);
  const other = siblings[at + direction];
  if (!other) return none;
  try {
    const key =
      direction === -1
        ? keyBetween(siblings[at - 2]?.sortKey ?? null, other.sortKey)
        : keyBetween(other.sortKey, siblings[at + 2]?.sortKey ?? null);
    return sortKeyUpdate(target, { sortKey: key });
  } catch {
    return { error: "No sort key fits there. Ask for help." };
  }
}

/** Put a segment inside the sibling before it, as that sibling's last child. */
export function nestSegmentEdit(segments: EditSegment[], id: number): Built {
  const target = segments.find((s) => s.id === id);
  if (!target) return none;
  const siblings = siblingsOf(segments, target.parentId);
  const before = siblings[siblings.findIndex((s) => s.id === id) - 1];
  if (!before) return none;
  try {
    const key = keyBetween(siblingsOf(segments, before.id).at(-1)?.sortKey ?? null, null);
    return sortKeyUpdate(target, { parentId: before.id, sortKey: key });
  } catch {
    return { error: "No sort key fits there. Ask for help." };
  }
}

/** Take a segment out of its container: it goes right after the container. */
export function unnestSegmentEdit(segments: EditSegment[], id: number): Built {
  const target = segments.find((s) => s.id === id);
  const parent = target?.parentId == null ? undefined : segments.find((s) => s.id === target.parentId);
  if (!target || !parent) return none;
  const siblings = siblingsOf(segments, parent.parentId);
  const next = siblings[siblings.findIndex((s) => s.id === parent.id) + 1];
  try {
    return sortKeyUpdate(target, { parentId: parent.parentId, sortKey: keyBetween(parent.sortKey, next?.sortKey ?? null) });
  } catch {
    return { error: "No sort key fits there. Ask for help." };
  }
}

// --- Bill ---

export interface BillDraft {
  act: { kind: "band" | "person"; id: number } | null;
  role: string;
  certainty: string;
}

export function addBillEdit(showId: number, bill: EditBillEntry[], draft: BillDraft): Built {
  if (!draft.act) return { error: "Pick the act: a band or a person." };
  const position = bill.reduce((max, entry) => Math.max(max, entry.position), 0) + 1;
  const act = draft.act.kind === "band" ? { actBandId: draft.act.id } : { actPersonId: draft.act.id };
  return { edits: [{ op: "create", type: "BillEntry", fields: { showId, position, role: draft.role, certainty: draft.certainty, ...act } }] };
}

export function updateBillEdit(entry: EditBillEntry, role: string, certainty: string): Built {
  const fields: Record<string, unknown> = {};
  if (role !== entry.role) fields.role = role;
  if (certainty !== entry.certainty) fields.certainty = certainty;
  return Object.keys(fields).length === 0 ? none : { edits: [{ op: "update", type: "BillEntry", id: entry.id, rev: entry.rev, fields }] };
}

export const removeBillEdit = (entry: EditBillEntry): Built => ({ edits: [{ op: "delete", type: "BillEntry", id: entry.id, rev: entry.rev }] });

export const moveBillEdits = (bill: EditBillEntry[], id: number, direction: -1 | 1): Built => ({
  edits: moveEdits({ type: "BillEntry" }, bill, id, direction) as Edit[],
});

// --- Notes ---

/** A new note on the show: the note and its link, in one save. */
export function addNoteEdits(showId: number, body: string, isPublic: boolean): Built {
  if (body.trim() === "") return { error: "Write the note text." };
  return {
    edits: [
      { op: "create", type: "Note", ref: "note", fields: { body: body.trim(), isPublic } },
      { op: "create", type: "NoteAttachment", fields: { noteId: { ref: "note" }, entityId: showId } },
    ],
  };
}

export function updateNoteEdit(note: EditNote, body: string, isPublic: boolean): Built {
  if (body.trim() === "") return { error: "Write the note text." };
  const fields: Record<string, unknown> = {};
  if (body.trim() !== note.body) fields.body = body.trim();
  if (isPublic !== note.isPublic) fields.isPublic = isPublic;
  return Object.keys(fields).length === 0 ? none : { edits: [{ op: "update", type: "Note", id: note.noteId, rev: note.noteRev, fields }] };
}

/** Take a note off the show. The write layer removes a note that no record uses any more. */
export const removeNoteEdit = (note: EditNote): Built => ({ edits: [{ op: "delete", type: "NoteAttachment", id: note.attachmentId }] });
