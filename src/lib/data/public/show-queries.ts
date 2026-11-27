import type { PrismaClient } from "@/generated/prisma/client";
import { ENTITY_FLAG, PUBLIC_ENTITY } from "./visibility";

/**
 * The queries behind the public show page. Each function is one query, and the page calls each
 * once, so the query count does not depend on the number of sets and segments. Every select is
 * explicit and lists only public fields (see `visibility.ts`).
 */
const JOIN = { relationLoadStrategy: "join" } as const;

const NAMED = { select: { name: true, ...ENTITY_FLAG } } as const;

export function loadPublicShow(db: PrismaClient, slug: string) {
  return db.show.findFirst({
    ...JOIN,
    where: { slug, ...PUBLIC_ENTITY },
    select: {
      id: true,
      slug: true,
      dateYear: true,
      dateMonth: true,
      dateDay: true,
      dateEndYear: true,
      dateEndMonth: true,
      dateEndDay: true,
      dateAsWritten: true,
      dateCertainty: true,
      timeLabel: true,
      placeNameId: true,
      placeCertainty: true,
      billedAs: true,
      status: true,
      statusCertainty: true,
      updatedAt: true,
      placeName: NAMED,
      place: {
        select: {
          ...ENTITY_FLAG,
          // The highest position is the latest name (schema, `PlaceName`).
          names: { where: PUBLIC_ENTITY, orderBy: { position: "desc" }, take: 1, select: { name: true } },
        },
      },
      band: { select: { name: true, slug: true, isHunterBand: true, ...ENTITY_FLAG } },
      bill: {
        where: PUBLIC_ENTITY,
        orderBy: { position: "asc" },
        select: { id: true, role: true, certainty: true, actBand: NAMED, actPerson: NAMED },
      },
      recordings: {
        where: PUBLIC_ENTITY,
        orderBy: { id: "asc" },
        select: {
          id: true,
          description: true,
          lengthMinutes: true,
          inCirculation: true,
          recordingType: { select: { name: true } },
          taper: NAMED,
        },
      },
    },
  });
}

export function loadPublicSets(db: PrismaClient, showId: number) {
  return db.set.findMany({
    ...JOIN,
    where: { showId, ...PUBLIC_ENTITY },
    orderBy: { position: "asc" },
    select: {
      id: true,
      setType: { select: { name: true, displayName: true } },
      band: { select: { name: true, ...ENTITY_FLAG } },
    },
  });
}

/**
 * The shape of the segments of the public sets, private ones included but only as structure: the
 * order, the parent, the join mark and the flag. This lets a hidden segment break or keep a
 * segue chain, with no content read.
 */
export function loadSegmentStructure(db: PrismaClient, setIds: number[]) {
  return db.segment.findMany({
    where: { setId: { in: setIds } },
    // `sortKey` is stored with byte order, so the database order is the reading order.
    orderBy: [{ setId: "asc" }, { sortKey: "asc" }],
    select: { id: true, setId: true, parentId: true, joinsNext: true, ...ENTITY_FLAG },
  });
}

export function loadPublicSegments(db: PrismaClient, ids: number[]) {
  return db.segment.findMany({
    ...JOIN,
    where: { id: { in: ids }, ...PUBLIC_ENTITY },
    select: {
      id: true,
      delivery: true,
      extent: true,
      portionNote: true,
      summary: true,
      workCertainty: true,
      work: { select: { title: true, ...ENTITY_FLAG } },
      deliveredBy: NAMED,
    },
  });
}

/** The public notes attached to any of the records. A private note is never selected. */
export function loadPublicNotes(db: PrismaClient, entityIds: number[]) {
  return db.noteAttachment.findMany({
    ...JOIN,
    where: { entityId: { in: entityIds }, note: { isPublic: true } },
    orderBy: { id: "asc" },
    select: { entityId: true, note: { select: { id: true, body: true } } },
  });
}

/** The active outside IDs of the recordings, with the link system that can turn them into links. */
export function loadRecordingLinks(db: PrismaClient, recordingIds: number[]) {
  return db.externalId.findMany({
    ...JOIN,
    where: { entityId: { in: recordingIds }, isActive: true, linkSystem: { urlTemplate: { not: null } } },
    orderBy: { id: "asc" },
    select: { entityId: true, value: true, linkSystem: { select: { name: true, urlTemplate: true, purpose: true } } },
  });
}

export type PublicShowRow = NonNullable<Awaited<ReturnType<typeof loadPublicShow>>>;
export type PublicSetRow = Awaited<ReturnType<typeof loadPublicSets>>[number];
export type SegmentStructureRow = Awaited<ReturnType<typeof loadSegmentStructure>>[number];
export type PublicSegmentRow = Awaited<ReturnType<typeof loadPublicSegments>>[number];
export type PublicNoteRow = Awaited<ReturnType<typeof loadPublicNotes>>[number];
export type RecordingLinkRow = Awaited<ReturnType<typeof loadRecordingLinks>>[number];
