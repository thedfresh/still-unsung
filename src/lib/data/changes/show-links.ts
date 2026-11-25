import { getPrisma } from "@/lib/db";
import type { Row } from "@/lib/changes/labels";
import { MODEL } from "@/lib/content-access";
import { JOIN } from "@/lib/data/shows/review-queries";
import { shortDate } from "@/lib/shows/review-words";

export interface ShowLink {
  id: number;
  label: string;
}

export interface LinkableItem {
  changesetId: number;
  tableName: string;
  recordId: number;
  before: Row | null;
  after: Row | null;
}

const tableOf = (type: string) => MODEL.models[type].table;
const num = (value: unknown): number | null => (typeof value === "number" ? value : null);
const ids = (values: Iterable<number | null>) => [...new Set([...values].filter((v): v is number => v !== null))];

/**
 * The shows that each changeset touched, for the links from the Changes page. The stored state of
 * an item names its parent record, not always the show, so the lookup climbs from segment to set
 * to show in batched queries: at most four for the whole page, never one per change. An item
 * whose record was deleted cannot be climbed and gives no link.
 */
export async function findShowLinks(items: LinkableItem[]): Promise<Map<number, ShowLink[]>> {
  const db = getPrisma();
  const state = (item: LinkableItem): Row => (item.after ?? item.before ?? {}) as Row;
  const direct = new Map<number, Set<number>>(); // changeset -> show IDs
  const add = (changeset: number, showId: number | null) => {
    if (showId !== null) direct.set(changeset, (direct.get(changeset) ?? new Set()).add(showId));
  };
  const viaSet: Array<[number, number]> = [];
  const viaSegment: Array<[number, number]> = [];
  const viaEntity: Array<[number, number]> = [];
  const showTables = new Set(["Set", "LineupEntry", "BillEntry", "Recording"].map(tableOf));
  for (const item of items) {
    const row = state(item);
    if (item.tableName === tableOf("Show")) add(item.changesetId, item.recordId);
    if (showTables.has(item.tableName)) add(item.changesetId, num(row.showId));
    if (num(row.setId) !== null) viaSet.push([item.changesetId, row.setId as number]);
    if (num(row.segmentId) !== null) viaSegment.push([item.changesetId, row.segmentId as number]);
    const entityField = item.tableName === tableOf("Reference") ? row.fromId : ["citations", "note_attachments"].includes(item.tableName) ? row.entityId : null;
    if (num(entityField) !== null) viaEntity.push([item.changesetId, entityField as number]);
  }

  const [sets, segments, entities] = await Promise.all([
    viaSet.length
      ? db.set.findMany({ where: { id: { in: ids(viaSet.map(([, id]) => id)) } }, select: { id: true, showId: true } })
      : [],
    viaSegment.length
      ? db.segment.findMany({
          ...JOIN,
          where: { id: { in: ids(viaSegment.map(([, id]) => id)) } },
          select: { id: true, set: { select: { showId: true } } },
        })
      : [],
    viaEntity.length
      ? db.entity.findMany({
          ...JOIN,
          where: { id: { in: ids(viaEntity.map(([, id]) => id)) } },
          select: {
            id: true,
            show: { select: { id: true } },
            set: { select: { showId: true } },
            segment: { select: { set: { select: { showId: true } } } },
          },
        })
      : [],
  ]);
  const showOfSet = new Map(sets.map((s) => [s.id, s.showId]));
  const showOfSegment = new Map(segments.map((s) => [s.id, s.set.showId]));
  const showOfEntity = new Map(entities.map((e) => [e.id, e.show?.id ?? e.set?.showId ?? e.segment?.set.showId ?? null]));
  viaSet.forEach(([changeset, id]) => add(changeset, showOfSet.get(id) ?? null));
  viaSegment.forEach(([changeset, id]) => add(changeset, showOfSegment.get(id) ?? null));
  viaEntity.forEach(([changeset, id]) => add(changeset, showOfEntity.get(id) ?? null));

  const allShowIds = ids([...direct.values()].flatMap((set) => [...set]));
  const shows = allShowIds.length
    ? await db.show.findMany({
        ...JOIN,
        where: { id: { in: allShowIds } },
        select: {
          id: true,
          dateYear: true,
          dateMonth: true,
          dateDay: true,
          dateAsWritten: true,
          placeName: { select: { name: true } },
          place: { select: { names: { orderBy: { position: "desc" }, take: 1, select: { name: true } } } },
        },
      })
    : [];
  const labels = new Map(
    shows.map((show) => [show.id, `Show ${[shortDate(show), show.placeName?.name ?? show.place?.names[0]?.name].filter(Boolean).join(", ")}`]),
  );
  const out = new Map<number, ShowLink[]>();
  for (const [changeset, set] of direct) {
    const links = [...set].filter((id) => labels.has(id)).map((id) => ({ id, label: labels.get(id) as string }));
    if (links.length > 0) out.set(changeset, links);
  }
  return out;
}
