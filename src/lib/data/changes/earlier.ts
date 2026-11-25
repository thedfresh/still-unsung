import { modelInfo } from "@/lib/content-access";
import { getPrisma } from "@/lib/db";
import { bareLabel, datePart, describeRecord, segmentLabel, setLabel, type Row } from "@/lib/changes/labels";
import type { ItemDetail, LinkInfo } from "@/lib/changes/readout";
import { typeOfKind } from "@/lib/data/changes/describe";
import { delegateOf, toJson, type Tx } from "@/lib/data/changes/rows";

interface StoredState {
  type: string;
  recordId: number;
  before: Row | null;
  after: Row | null;
}

/** The records that a state points at, as `[field, target id]` pairs. */
function linkFields(type: string, row: Row | null): Array<[string, number]> {
  const out: Array<[string, number]> = [];
  for (const [field, value] of Object.entries(row ?? {})) {
    if (field !== "id" && typeof value === "number" && modelInfo(type)?.fields[field]?.fk) out.push([field, value]);
  }
  return out;
}

/**
 * Look up the names of the records that old changeset items point at. An item stored before the
 * apply step saved its names has only IDs. This reads the page's records in a few queries: one
 * per type, and no query per item. A record that no longer exists has no name.
 */
export async function lookUpNames(states: StoredState[]): Promise<Array<{ links: ItemDetail["links"]; label: string | null }>> {
  const db = getPrisma() as unknown as Tx;
  const rows = new Map<string, Map<number, Row>>();
  /** Load the records of one type that are not loaded yet: one query. */
  const load = async (type: string, ids: Iterable<number>) => {
    const have = rows.get(type) ?? new Map<number, Row>();
    rows.set(type, have);
    const missing = [...new Set(ids)].filter((id) => !have.has(id));
    if (missing.length === 0 || !("id" in (modelInfo(type)?.fields ?? {}))) return;
    for (const row of await delegateOf(db, type).findMany({ where: { id: { in: missing } } })) have.set(row.id as number, toJson(row));
  };
  // Round 1: the records the items point at. A shared record's type comes from its entity kind.
  const wanted = new Map<string, Set<number>>();
  const entityIds = new Set<number>();
  const want = (type: string, id: number) => wanted.set(type, (wanted.get(type) ?? new Set<number>()).add(id));
  for (const state of states) {
    want(state.type, state.recordId);
    for (const row of [state.before, state.after]) {
      for (const [field, id] of linkFields(state.type, row)) {
        const target = modelInfo(state.type).fields[field].fk as string;
        if (target === "Entity") entityIds.add(id);
        else want(target, id);
      }
    }
  }
  const typeOfEntity = new Map<number, string>();
  if (entityIds.size > 0) {
    for (const entity of await getPrisma().entity.findMany({ where: { id: { in: [...entityIds] } }, select: { id: true, kind: true } })) {
      const type = typeOfKind(entity.kind);
      if (type) {
        typeOfEntity.set(entity.id, type);
        want(type, entity.id);
      }
    }
  }
  for (const [type, ids] of wanted) await load(type, ids);
  // Round 2: what a segment, a set and a show need for their names.
  const segments = [...(rows.get("Segment")?.values() ?? [])];
  await load("Set", [...(wanted.get("Set") ?? []), ...segments.map((s) => s.setId).filter((id): id is number => typeof id === "number")]);
  await load("Work", segments.map((s) => s.workId).filter((id): id is number => typeof id === "number"));
  const numbers = (list: Iterable<Row>, field: string) => [...list].map((r) => r[field]).filter((id): id is number => typeof id === "number");
  await load("Show", [...(wanted.get("Show") ?? []), ...numbers(rows.get("Set")?.values() ?? [], "showId")]);
  await load("PlaceName", numbers(rows.get("Show")?.values() ?? [], "placeNameId"));
  const rowOf = (type: string, id: unknown) => (typeof id === "number" ? rows.get(type)?.get(id) : undefined);
  const showDate = (showId: unknown) => {
    const show = rowOf("Show", showId);
    return show ? datePart(show) : null;
  };
  /** The name of one record, made from the loaded rows; null when the record is gone. */
  const labelOf = (type: string, id: number): string | null => {
    const row = rowOf(type, id);
    if (!row) return null;
    if (type === "Set") return setLabel(row, showDate(row.showId)) ?? describeRecord(type, row);
    if (type === "Segment") return segmentLabel((rowOf("Work", row.workId)?.title as string | undefined) ?? null, showDate(rowOf("Set", row.setId)?.showId), row);
    if (type === "Show") return describeRecord(type, row, (rowOf("PlaceName", row.placeNameId)?.name as string | undefined) ?? null);
    return describeRecord(type, row);
  };
  const linksOf = (type: string, row: Row | null): Record<string, LinkInfo> => {
    const out: Record<string, LinkInfo> = {};
    for (const [field, id] of linkFields(type, row)) {
      const target = modelInfo(type).fields[field].fk as string;
      const targetType = target === "Entity" ? typeOfEntity.get(id) : target;
      const label = targetType ? labelOf(targetType, id) : null;
      if (targetType && label) out[field] = { type: targetType, label, name: bareLabel(targetType, label), isNew: false };
    }
    return out;
  };
  return states.map((state) => ({
    links: { before: linksOf(state.type, state.before), after: linksOf(state.type, state.after) },
    label: labelOf(state.type, state.recordId),
  }));
}
