import type { Prisma } from "@/generated/prisma/client";
import { datePart, describeRecord, segmentLabel, setLabel, type Row } from "@/lib/changes/labels";
import { modelInfo, usesEntityPublicFlag } from "@/lib/content-access";

export type Tx = Prisma.TransactionClient;

/** The few Prisma delegate methods the generic writer uses. */
export interface Delegate {
  findUnique(args: object): Promise<Row | null>;
  findFirst(args: object): Promise<Row | null>;
  findMany(args: object): Promise<Row[]>;
  create(args: object): Promise<Row>;
  updateMany(args: object): Promise<{ count: number }>;
}

export function delegateOf(tx: Tx, type: string): Delegate {
  return (tx as unknown as Record<string, Delegate>)[modelInfo(type).delegate];
}

/** A row as plain JSON: dates become strings, so it can go in a JSON column. */
export function toJson(row: Row): Row {
  return JSON.parse(JSON.stringify(row)) as Row;
}

/**
 * Read one record by ID. A shared record also gets its public flag from the `entities` row, so
 * a change to the flag shows in the before and after states.
 */
export async function readRow(tx: Tx, type: string, id: number): Promise<Row | null> {
  const info = modelInfo(type);
  if (!("id" in info.fields)) return null;
  const row = await delegateOf(tx, type).findUnique({
    where: { id },
    ...(usesEntityPublicFlag(type) ? { include: { entity: { select: { isPublic: true } } } } : {}),
  });
  if (!row) return null;
  const { entity, ...rest } = row as Row & { entity?: { isPublic: boolean } };
  return toJson(usesEntityPublicFlag(type) ? { ...rest, isPublic: entity?.isPublic ?? true } : rest);
}

/** The date of a show, as text, or null when the show is unknown or has no date. */
async function showDateOf(tx: Tx, showId: unknown): Promise<string | null> {
  if (typeof showId !== "number") return null;
  const show = await tx.show.findUnique({ where: { id: showId }, select: { dateYear: true, dateMonth: true, dateDay: true, dateAsWritten: true } });
  return show ? datePart(show) : null;
}

/**
 * A readable name for a record. A show also gets the name of its place. A set is named by its
 * show and position, a segment by its work and show.
 */
export async function labelRow(tx: Tx, type: string, row: Row, withId = true): Promise<string> {
  if (type === "Set") return setLabel(row, await showDateOf(tx, row.showId)) ?? describeRecord(type, row, null, withId);
  if (type === "Segment") {
    const set = typeof row.setId === "number" ? await tx.set.findUnique({ where: { id: row.setId }, select: { showId: true } }) : null;
    const work = typeof row.workId === "number" ? await tx.work.findUnique({ where: { id: row.workId }, select: { title: true } }) : null;
    return segmentLabel(work?.title ?? null, await showDateOf(tx, set?.showId));
  }
  if (type !== "Show") return describeRecord(type, row, null, withId);
  const placeNameId = row.placeNameId;
  const placeId = row.placeId;
  let name: string | null = null;
  if (typeof placeNameId === "number") {
    name = ((await tx.placeName.findUnique({ where: { id: placeNameId }, select: { name: true } })) ?? null)?.name ?? null;
  } else if (typeof placeId === "number") {
    name = (await tx.placeName.findFirst({ where: { placeId }, orderBy: { position: "asc" }, select: { name: true } }))?.name ?? null;
  }
  return describeRecord(type, row, name, withId);
}
