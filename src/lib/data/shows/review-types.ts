/** The shape of the show review page. Every value is text ready to show; no bare IDs as names. */

export interface ReviewLine {
  key: string;
  text: string;
  origin: string | null;
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
  /** Number in the set: "3", or "3.1" for a child of segment 3. */
  number: string;
  depth: number;
  origin: string | null;
  /** Work title, or words such as "unknown song" or "talk". */
  work: string;
  delivery: string | null;
  wordsFrom: string | null;
  tuneFrom: string | null;
  extent: string | null;
  portionNote: string | null;
  cuts: string[];
  deliveredBy: string | null;
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
  placeName: string | null;
  billedAs: string | null;
  band: string | null;
  showType: string | null;
  status: string;
  timeLabel: string | null;
  bill: ReviewLine[];
  /** Exceptions only, as stored. */
  lineup: ReviewLine[];
  recordings: ReviewLine[];
  attachments: ReviewAttachments;
  sets: ReviewSet[];
}
