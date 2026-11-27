/** What the show editor page reads, as plain values for the editor. Types only. */

export interface EditChoice {
  id: number;
  label: string;
}

export interface EditSegment {
  id: number;
  rev: number;
  parentId: number | null;
  sortKey: string;
  /** How deep it sits: 0 for a top-level segment. */
  depth: number;
  /** The position as shown: "1", "1.1", "2". */
  number: string;
  workId: number | null;
  workTitle: string | null;
  delivery: string | null;
  extent: string;
  joinsNext: boolean;
  portionNote: string | null;
  summary: string | null;
}

export interface EditSet {
  id: number;
  rev: number;
  position: number;
  setTypeId: number;
  setTypeName: string;
  /** In reading order: a container comes before its children. */
  segments: EditSegment[];
}

export interface EditBillEntry {
  id: number;
  rev: number;
  position: number;
  role: string;
  certainty: string;
  /** The act's name. */
  actName: string;
  /** The admin page of the act (a band or a person), or null. */
  actHref: string | null;
}

export interface EditNote {
  /** The note and its link to this show. */
  noteId: number;
  noteRev: number;
  attachmentId: number;
  body: string;
  isPublic: boolean;
  /** How many other records the note is attached to. */
  alsoAttachedTo: number;
}

export interface EditPlace {
  id: number;
  label: string;
  /** The place's names, in position order. */
  names: EditChoice[];
}

export interface ShowEditData {
  id: number;
  rev: number;
  title: string;
  year: number | null;
  month: number | null;
  day: number | null;
  dateAsWritten: string | null;
  place: EditPlace | null;
  placeNameId: number | null;
  billedAs: string | null;
  band: EditChoice | null;
  status: string;
  bill: EditBillEntry[];
  sets: EditSet[];
  notes: EditNote[];
  setTypes: EditChoice[];
  /** The public page of the show, when it has one. */
  publicHref: string | null;
}
