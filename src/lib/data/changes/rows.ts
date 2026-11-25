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

/** Lookups already made in one describe call, so a long changeset does not repeat them. */
export type LookupCache = Map<string, Promise<unknown>>;

/** Run `lookup` once per key. */
export function memo<T>(cache: LookupCache | undefined, key: string, lookup: () => Promise<T>): Promise<T> {
  if (!cache) return lookup();
  const known = cache.get(key) as Promise<T> | undefined;
  if (known) return known;
  const started = lookup();
  cache.set(key, started);
  return started;
}

/** One set, whole. The one cache key per set, so a label and a parent lookup share one query. */
export function setRowOf(tx: Tx, setId: number, cache?: LookupCache): Promise<Row | null> {
  return memo(cache, `set:${setId}`, () => tx.set.findUnique({ where: { id: setId } }) as Promise<Row | null>);
}

/** The date of a show, as text, or null when the show is unknown or has no date. */
async function showDateOf(tx: Tx, showId: unknown, cache?: LookupCache): Promise<string | null> {
  if (typeof showId !== "number") return null;
  const show = await memo(cache, `show:${showId}`, () =>
    tx.show.findUnique({ where: { id: showId }, select: { dateYear: true, dateMonth: true, dateDay: true, dateAsWritten: true } }),
  );
  return show ? datePart(show) : null;
}

/**
 * A readable name for a record. A show also gets the name of its place. A set is named by its
 * show and position, a segment by its work and show. `cache` saves repeated lookups.
 */
export async function labelRow(tx: Tx, type: string, row: Row, withId = true, cache?: LookupCache): Promise<string> {
  if (type === "Set") return setLabel(row, await showDateOf(tx, row.showId, cache)) ?? describeRecord(type, row, null, withId);
  if (type === "Segment") {
    const setId = row.setId;
    const workId = row.workId;
    const set = typeof setId === "number" ? await setRowOf(tx, setId, cache) : null;
    const work = typeof workId === "number" ? await memo(cache, `work:${workId}`, () => tx.work.findUnique({ where: { id: workId }, select: { title: true } })) : null;
    return segmentLabel(work?.title ?? null, await showDateOf(tx, set?.showId, cache), row);
  }
  if (type === "Place") {
    // A place has no name of its own: it reads by its first PlaceName, also one made in the same save.
    const id = row.id;
    const first =
      typeof id === "number"
        ? await memo(cache, `placeOf:${id}`, () => tx.placeName.findFirst({ where: { placeId: id }, orderBy: { position: "asc" }, select: { name: true } }))
        : null;
    return describeRecord(type, first ? { ...row, name: first.name } : row, null, withId);
  }
  if (type !== "Show") return describeRecord(type, row, null, withId);
  const placeNameId = row.placeNameId;
  const placeId = row.placeId;
  let name: string | null = null;
  if (typeof placeNameId === "number") {
    name = (await memo(cache, `placeName:${placeNameId}`, () => tx.placeName.findUnique({ where: { id: placeNameId }, select: { name: true } })))?.name ?? null;
  } else if (typeof placeId === "number") {
    name = (await memo(cache, `placeOf:${placeId}`, () => tx.placeName.findFirst({ where: { placeId }, orderBy: { position: "asc" }, select: { name: true } })))?.name ?? null;
  }
  return describeRecord(type, row, name, withId);
}
