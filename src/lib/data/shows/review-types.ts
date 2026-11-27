/** The shape of the show review page. Every value is text ready to show; no bare IDs as names. */

export interface ReviewLine {
  key: string;
  text: string;
  origin: string | null;
  /** The part of `text` that names a record, with its admin page (HSA-186). The page makes it a link. */
  link?: { text: string; href: string };
}

export interface ReviewReference {
  key: string;
  kind: string;
  /** The target by name. */
  target: string;
  /** The admin page of the target, when it has one (a show, or a set or segment of a show). */
  href: string | null;
  certainty: string | null;
  note: string | null;
  origin: string | null;
}

export interface ReviewCitation {
  key: string;
  /** The source, recording or contributor, by name. */
  by: string;
  aspect: string | null;
  /** The page or the time on the tape. */
  place: string | null;
  note: string | null;
  /** PRIVATE. */
  excerpt: string | null;
  origin: string | null;
}

export interface ReviewNote {
  key: string;
  body: string;
  isPublic: boolean;
  origin: string | null;
}

/** What hangs under a show, a set or a segment. */
export interface ReviewAttachments {
  references: ReviewReference[];
  citations: ReviewCitation[];
  notes: ReviewNote[];
}

export interface ReviewSegment {
  id: number;
  /** The version of the record that this page read. An edit form sends it back (item 87). */
  rev: number;
  /** Number in the set: "3", or "3.1" for a child of segment 3. */
  number: string;
  depth: number;
  origin: string | null;
  /** Work title, or words such as "unknown song" or "talk". */
  work: string;
  /** The admin page of the work, or null for a talk or an unknown song. The same rule holds for the next three. */
  workHref: string | null;
  delivery: string | null;
  wordsFrom: string | null;
  wordsFromHref: string | null;
  tuneFrom: string | null;
  tuneFromHref: string | null;
  extent: string | null;
  portionNote: string | null;
  cuts: string[];
  deliveredBy: string | null;
  deliveredByHref: string | null;
  joinMark: string | null;
  summary: string | null;
  /** PRIVATE. */
  wordsAsHeard: string | null;
  wordsPublic: boolean;
  vocals: ReviewLine[];
  lineup: ReviewLine[];
  attachments: ReviewAttachments;
}

export interface ReviewSet {
  id: number;
  position: number;
  setType: string;
  incompleteReason: string | null;
  band: string | null;
  bandHref: string | null;
  origin: string | null;
  lineup: ReviewLine[];
  attachments: ReviewAttachments;
  segments: ReviewSegment[];
}

export interface ReviewShow {
  id: number;
  title: string;
  origin: string | null;
  date: string;
  place: string | null;
  placeHref: string | null;
  placeName: string | null;
  billedAs: string | null;
  band: string | null;
  bandHref: string | null;
  showType: string | null;
  /** Only a status other than "took place", the default. */
  status: string | null;
  timeLabel: string | null;
  bill: ReviewLine[];
  /** Exceptions only, as stored. */
  lineup: ReviewLine[];
  recordings: ReviewLine[];
  attachments: ReviewAttachments;
  sets: ReviewSet[];
}
