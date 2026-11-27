/**
 * The shape of a public show, as the public read layer returns it. Every value is safe to show:
 * the layer never selects a private field, so none of them can be in these types.
 */

export type PublicCertainty = "CONFIRMED" | "PROBABLE" | "POSSIBLE" | "UNKNOWN";
export type PublicDelivery = "SUNG" | "SUNG_A_CAPPELLA" | "PLAYED" | "SPOKEN" | "RECORDING_PLAYED";
export type PublicExtent = "COMPLETE" | "PARTIAL" | "FRAGMENT" | "ABORTED";

/** A public note: Markdown text. */
export interface PublicNote {
  id: number;
  body: string;
}

export interface PublicSegment {
  id: number;
  /** The work's title. Null when the segment has no work, or when the work is not public. */
  workTitle: string | null;
  workIsHidden: boolean;
  workCertainty: PublicCertainty;
  delivery: PublicDelivery | null;
  extent: PublicExtent;
  portionNote: string | null;
  /** The segment runs into the next public segment (the chain stays true across a hidden one). */
  joinsNext: boolean;
  /** The public one-line summary. */
  summary: string | null;
  deliveredBy: string | null;
  notes: PublicNote[];
  /** The segments inside this one (a suite), in order. */
  children: PublicSegment[];
}

export interface PublicSet {
  id: number;
  label: string;
  /** The band of this set, only when it differs from the show's band. */
  band: string | null;
  notes: PublicNote[];
  segments: PublicSegment[];
}

export interface PublicBillLine {
  id: number;
  /** "headliner", "opener" or "co-bill". */
  role: string;
  name: string;
  certainty: PublicCertainty;
}

export interface PublicRecordingLink {
  label: string;
  /** An https address built from the link system's template. */
  url: string;
}

export interface PublicRecording {
  id: number;
  type: string | null;
  description: string | null;
  taper: string | null;
  lengthMinutes: number | null;
  inCirculation: boolean;
  links: PublicRecordingLink[];
}

export interface PublicDateParts {
  dateYear: number | null;
  dateMonth: number | null;
  dateDay: number | null;
  dateEndYear: number | null;
  dateEndMonth: number | null;
  dateEndDay: number | null;
  dateAsWritten: string | null;
  dateCertainty: PublicCertainty;
}

export interface PublicShow {
  id: number;
  slug: string;
  date: PublicDateParts;
  /** "Early", "Late" and so on, as the source states it. */
  timeLabel: string | null;
  /** The name of the place that this show used. Null when the place is not known or not public. */
  placeName: string | null;
  placeCertainty: PublicCertainty;
  billedAs: string | null;
  band: { name: string; slug: string | null; isHunterBand: boolean } | null;
  /** Null for a show that took place with no doubt about it. */
  statusWords: string | null;
  bill: PublicBillLine[];
  notes: PublicNote[];
  sets: PublicSet[];
  recordings: PublicRecording[];
  /** The latest change to the show's own row. */
  updatedAt: Date;
}

/** The link to a neighbour in date order. */
export interface PublicShowLink {
  slug: string;
}
