/**
 * Setlist rows for the public show page, derived from the public segments. Pure functions: no
 * database, no React. One place holds the rules for the two views:
 *
 * - **standard:** the songs in order, with a segue mark between segments that run together.
 *   Fragments (teases) are left out. A partial or aborted song says so in words.
 * - **complete:** every song segment, fragments included, with its delivery and extent in words
 *   and numbered footnotes (the portion description and the public notes of the segment).
 *
 * Talk segments are never in the setlist: the stage talk list shows them.
 */
import type { PublicNote, PublicSegment, PublicSet } from "@/lib/data/public/show-types";
import { dropWithJoins } from "@/lib/shows/join-chain";
import { certaintyNote, deliveryWords } from "@/lib/shows/review-words";

export type SetlistView = "standard" | "complete";

export interface SetlistRow {
  id: number;
  title: string;
  /** Words after the title, such as "fragment" or "sung a cappella". Never a symbol alone. */
  marks: string[];
  footnotes: number[];
  /** The row runs into the next row of its level. */
  joinsNext: boolean;
  children: SetlistRow[];
}

export interface SetlistSet {
  id: number;
  label: string;
  band: string | null;
  notes: PublicNote[];
  rows: SetlistRow[];
}

export interface Footnote {
  number: number;
  /** Plain text for a portion description, Markdown for a public note. */
  text: string;
  markdown: boolean;
}

export interface Setlist {
  sets: SetlistSet[];
  footnotes: Footnote[];
  /** True when the complete view shows rows or marks that the standard view leaves out. */
  hasMoreInComplete: boolean;
}

/** A talk segment: spoken, with no work. */
export function isTalk(segment: PublicSegment): boolean {
  return segment.delivery === "SPOKEN" && segment.workTitle === null && !segment.workIsHidden;
}

/** The title of a row. A work that is not public never shows its title. */
function titleOf(segment: PublicSegment): string {
  if (segment.workIsHidden) return "Title not public";
  if (segment.workTitle !== null) return `${segment.workTitle}${certaintyNote(segment.workCertainty)}`;
  return segment.delivery === "RECORDING_PLAYED" ? "Recording played" : "Unknown song";
}

function marksOf(segment: PublicSegment, view: SetlistView): string[] {
  const marks: string[] = [];
  if (segment.extent === "PARTIAL") marks.push("partial");
  if (segment.extent === "ABORTED") marks.push("aborted");
  if (view === "complete") {
    if (segment.extent === "FRAGMENT") marks.push("fragment");
    const delivery = segment.delivery === "SUNG" ? null : deliveryWords(segment.delivery);
    if (delivery) marks.push(delivery);
  }
  return marks;
}

class FootnoteList {
  readonly list: Footnote[] = [];
  private readonly byText = new Map<string, number>();

  /** One footnote for one text, however many rows share it. */
  number(text: string, markdown: boolean): number {
    const known = this.byText.get(`${markdown}:${text}`);
    if (known !== undefined) return known;
    const number = this.list.length + 1;
    this.list.push({ number, text, markdown });
    this.byText.set(`${markdown}:${text}`, number);
    return number;
  }
}

function keepInView(segment: PublicSegment, view: SetlistView): boolean {
  return !isTalk(segment) && (view === "complete" || segment.extent !== "FRAGMENT");
}

function buildRows(segments: PublicSegment[], view: SetlistView, notes: FootnoteList): SetlistRow[] {
  return dropWithJoins(segments, (segment) => keepInView(segment, view)).map((segment): SetlistRow => {
    const footnotes: number[] = [];
    if (view === "complete") {
      if (segment.portionNote) footnotes.push(notes.number(segment.portionNote, false));
      for (const note of segment.notes) footnotes.push(notes.number(note.body, true));
    }
    return {
      id: segment.id,
      title: titleOf(segment),
      marks: marksOf(segment, view),
      footnotes,
      joinsNext: segment.joinsNext,
      children: buildRows(segment.children, view, notes),
    };
  });
}

function anyIn(segments: PublicSegment[], test: (segment: PublicSegment) => boolean): boolean {
  return segments.some((segment) => test(segment) || anyIn(segment.children, test));
}

/** The setlist of a show in one view. */
export function buildSetlist(sets: PublicSet[], view: SetlistView): Setlist {
  const notes = new FootnoteList();
  const out = sets.map(
    (set): SetlistSet => ({
      id: set.id,
      label: set.label,
      band: set.band,
      notes: set.notes,
      rows: buildRows(set.segments, view, notes),
    }),
  );
  const hasMoreInComplete = sets.some((set) =>
    anyIn(
      set.segments,
      (segment) =>
        !isTalk(segment) &&
        (segment.extent === "FRAGMENT" ||
          (segment.delivery !== null && segment.delivery !== "SUNG") ||
          Boolean(segment.portionNote) ||
          segment.notes.length > 0),
    ),
  );
  return { sets: out, footnotes: notes.list, hasMoreInComplete };
}

export interface StageTalkEntry {
  id: number;
  summary: string;
  setLabel: string;
}

/** The public summary of each talk segment, in order across the sets. A talk with no summary has no entry. */
export function stageTalk(sets: PublicSet[]): StageTalkEntry[] {
  const out: StageTalkEntry[] = [];
  const walk = (segments: PublicSegment[], setLabel: string) => {
    for (const segment of segments) {
      if (isTalk(segment) && segment.summary) out.push({ id: segment.id, summary: segment.summary, setLabel });
      walk(segment.children, setLabel);
    }
  };
  for (const set of sets) walk(set.segments, set.label);
  return out;
}
