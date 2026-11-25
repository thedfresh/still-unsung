import type { PrismaClient } from "@/generated/prisma/client";

/**
 * The queries behind the show review page. Each `load…` function is one database query, and the
 * page calls each once, so the query count does not depend on the number of segments. The join
 * load keeps each read with its relations in one query.
 */
export const JOIN = { relationLoadStrategy: "join" } as const;

const NAME = { select: { name: true } } as const;
const TITLE = { select: { title: true } } as const;
export const DATE_SELECT = { dateYear: true, dateMonth: true, dateDay: true, dateAsWritten: true } as const;

const LATEST_PLACE_NAME = { names: { orderBy: { position: "desc" }, take: 1, select: { name: true } } } as const;

const PERSON_WITH_INSTRUMENTS = {
  person: NAME,
  instruments: { include: { instrument: { select: { name: true } } } },
} as const;

export function loadShow(db: PrismaClient, id: number) {
  return db.show.findUnique({
    ...JOIN,
    where: { id },
    include: {
      place: { include: LATEST_PLACE_NAME },
      placeName: NAME,
      band: NAME,
      showType: NAME,
      bill: { orderBy: { position: "asc" }, include: { actBand: NAME, actPerson: NAME } },
      lineup: { orderBy: { id: "asc" }, include: PERSON_WITH_INSTRUMENTS },
      recordings: { orderBy: { id: "asc" }, include: { recordingType: NAME } },
    },
  });
}

export function loadSets(db: PrismaClient, showId: number) {
  return db.set.findMany({
    ...JOIN,
    where: { showId },
    orderBy: { position: "asc" },
    include: {
      setType: { select: { name: true, displayName: true } },
      incompleteReason: NAME,
      band: NAME,
      lineup: { orderBy: { id: "asc" }, include: PERSON_WITH_INSTRUMENTS },
    },
  });
}

export function loadSegments(db: PrismaClient, setIds: number[]) {
  return db.segment.findMany({
    ...JOIN,
    where: { setId: { in: setIds } },
    // `sortKey` is stored with byte order, so the database order is the reading order.
    orderBy: [{ setId: "asc" }, { sortKey: "asc" }],
    include: {
      work: TITLE,
      wordsFromWork: TITLE,
      tuneFromWork: TITLE,
      deliveredBy: NAME,
      vocals: { orderBy: { id: "asc" }, include: { person: NAME, passage: { select: { label: true } } } },
      lineup: { orderBy: { id: "asc" }, include: PERSON_WITH_INSTRUMENTS },
    },
  });
}

const TARGET_SELECT = {
  id: true,
  kind: true,
  show: { select: { ...DATE_SELECT, placeName: NAME, place: { include: LATEST_PLACE_NAME } } },
  set: { select: { position: true, showId: true, show: { select: DATE_SELECT } } },
  segment: {
    select: { summary: true, work: TITLE, set: { select: { showId: true, show: { select: DATE_SELECT } } } },
  },
  work: TITLE,
  person: NAME,
  band: NAME,
  place: { include: LATEST_PLACE_NAME },
  placeName: NAME,
  source: TITLE,
  recording: { select: { description: true, show: { select: DATE_SELECT } } },
  subject: NAME,
  guidePage: TITLE,
  version: NAME,
} as const;

export function loadReferences(db: PrismaClient, fromIds: number[]) {
  return db.reference.findMany({
    ...JOIN,
    where: { fromId: { in: fromIds } },
    orderBy: { id: "asc" },
    include: { referenceKind: NAME, saidBy: NAME, to: { select: TARGET_SELECT } },
  });
}

export function loadCitations(db: PrismaClient, entityIds: number[]) {
  return db.citation.findMany({
    ...JOIN,
    where: { entityId: { in: entityIds } },
    orderBy: { id: "asc" },
    include: {
      source: TITLE,
      contributor: NAME,
      recording: { select: { description: true, show: { select: DATE_SELECT } } },
    },
  });
}

export function loadNotes(db: PrismaClient, entityIds: number[]) {
  return db.noteAttachment.findMany({
    ...JOIN,
    where: { entityId: { in: entityIds } },
    orderBy: { id: "asc" },
    include: { note: true },
  });
}

export type ShowRow = NonNullable<Awaited<ReturnType<typeof loadShow>>>;
export type SetRow = Awaited<ReturnType<typeof loadSets>>[number];
export type SegmentRow = Awaited<ReturnType<typeof loadSegments>>[number];
export type ReferenceRow = Awaited<ReturnType<typeof loadReferences>>[number];
export type CitationRow = Awaited<ReturnType<typeof loadCitations>>[number];
export type NoteRow = Awaited<ReturnType<typeof loadNotes>>[number];
