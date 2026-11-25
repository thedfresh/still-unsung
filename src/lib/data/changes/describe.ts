import { MODEL, modelInfo } from "@/lib/content-access";
import { bareLabel, type Row } from "@/lib/changes/labels";
import type { ItemDetail, LinkInfo, ParentInfo } from "@/lib/changes/readout";
import type { PreviewItem } from "@/lib/changes/preview-format";
import { labelRow, memo, readRow, setRowOf, toJson, type LookupCache, type Tx } from "@/lib/data/changes/rows";
import type { AppliedItem } from "@/lib/data/changes/write-edits";

/** Records that head their own group in the readout. */
const ROOT_TYPES = new Set(["Show", "Work", "Person", "Band", "Place", "Source", "Subject", "ShowGroup", "Period", "Note", "GuidePage"]);
/**
 * The fields that say which record another record belongs under, most specific first. A citation
 * sits under the record it supports (`entityId`), not under its source, so `entityId` comes first.
 */
const PARENT_FIELDS = ["showId", "setId", "segmentId", "lineupEntryId", "versionId", "workId", "personId", "bandId", "placeId", "entityId", "sourceId", "showGroupId", "fromId"];
const MAX_DEPTH = 6;

/** The model whose records have this shared-record kind. */
export function typeOfKind(kind: string): string | null {
  return Object.keys(MODEL.models).find((type) => MODEL.models[type].entityKind === kind) ?? null;
}

export interface DescribeOptions {
  /**
   * True when the records have their final IDs (the apply step), so an unnamed record reads
   * `Reference #123`. A preview has only trial IDs, so it leaves them out.
   */
  final?: boolean;
}

/**
 * Name the records of a preview or an apply, inside the transaction that wrote them. Each item
 * gets its label, the names of the records its fields point at, and the record it is grouped
 * under. The readout needs nothing else, so the apply step stores this and the Changes page
 * needs no queries for it. Every lookup runs once per call, because the apply step runs this
 * inside a transaction with a time limit.
 */
export async function describeItems(tx: Tx, items: AppliedItem[], options: DescribeOptions = {}): Promise<PreviewItem[]> {
  const cache: LookupCache = new Map();
  const labels = new Map<string, string>();
  const keyOf = (type: string, id: number) => `${type}:${id}`;
  const createdHere = new Set(items.filter((i) => i.op === "create").map((i) => keyOf(i.type, i.id)));
  const withId = options.final ?? false;
  // A changed record is named by its stored value; a new record is named by its new value.
  for (const item of items) {
    const label = item.op === "update" && item.before ? await labelRow(tx, item.type, item.before, true, cache) : await labelRow(tx, item.type, item.after, withId, cache);
    labels.set(keyOf(item.type, item.id), label);
  }
  const rowOf = (type: string, id: number): Promise<Row | null> =>
    type === "Set" ? setRowOf(tx, id, cache).then((row) => (row ? toJson(row) : null)) : memo(cache, `row:${keyOf(type, id)}`, () => readRow(tx, type, id));
  const nameOf = async (type: string, id: number): Promise<string> => {
    const known = labels.get(keyOf(type, id));
    if (known) return known;
    const found = await rowOf(type, id);
    const label = found ? await labelRow(tx, type, found, true, cache) : `${type} #${id}`;
    labels.set(keyOf(type, id), label);
    return label;
  };
  /** The record a field points at, with its type; null when the field is not a link. */
  const targetOf = async (type: string, field: string, value: unknown): Promise<{ type: string; id: number } | null> => {
    const target = modelInfo(type).fields[field]?.fk;
    if (field === "id" || !target || typeof value !== "number") return null;
    if (target !== "Entity") return { type: target, id: value };
    const entity = await memo(cache, `entity:${value}`, () => tx.entity.findUnique({ where: { id: value }, select: { kind: true } }));
    const entityType = entity ? typeOfKind(entity.kind) : null;
    return entityType ? { type: entityType, id: value } : null;
  };
  const linkLabel = async (type: string, field: string, value: unknown): Promise<LinkInfo | null> => {
    const target = await targetOf(type, field, value);
    if (!target) {
      // The record is gone only when the shared-record row itself is missing. An unknown kind has no name to look up.
      const fk = modelInfo(type).fields[field]?.fk;
      if (field === "id" || fk !== "Entity" || typeof value !== "number") return null;
      const entity = await memo(cache, `entity:${value}`, () => tx.entity.findUnique({ where: { id: value }, select: { kind: true } }));
      return entity ? null : { type: "Entity", label: "", name: "", isNew: false, deleted: true };
    }
    if (!labels.has(keyOf(target.type, target.id)) && !(await rowOf(target.type, target.id))) {
      return { type: target.type, label: "", name: "", isNew: false, deleted: true };
    }
    const label = await nameOf(target.type, target.id);
    return { type: target.type, label, name: bareLabel(target.type, label), isNew: createdHere.has(keyOf(target.type, target.id)) };
  };
  const linksOf = async (type: string, row: Row | null): Promise<Record<string, LinkInfo>> => {
    const out: Record<string, LinkInfo> = {};
    for (const [field, value] of Object.entries(row ?? {})) {
      const label = await linkLabel(type, field, value);
      if (label) out[field] = label;
    }
    return out;
  };
  const parents = new Map<string, ParentInfo>();
  /** The record that this record is grouped under: its show, its work, its person. */
  const parentOf = async (type: string, id: number, row: Row | null, depth = 0): Promise<ParentInfo> => {
    const key = keyOf(type, id);
    const known = parents.get(key);
    if (known) return known;
    let parent: ParentInfo | null = null;
    if (type === "Note" && depth < MAX_DEPTH) {
      // A note has no parent of its own: it sits with the record it is attached to.
      const attachment = items.find((i) => i.type === "NoteAttachment" && i.after.noteId === id);
      if (attachment) parent = await parentOf("NoteAttachment", attachment.id, attachment.after, depth + 1);
    } else if (!ROOT_TYPES.has(type) && depth < MAX_DEPTH) {
      const state = row ?? (await rowOf(type, id));
      for (const field of PARENT_FIELDS) {
        const target = state ? await targetOf(type, field, state[field]) : null;
        if (target) {
          parent = await parentOf(target.type, target.id, null, depth + 1);
          break;
        }
      }
    }
    const result = parent ?? { key, type, label: await nameOf(type, id) };
    parents.set(key, result);
    return result;
  };
  const described: PreviewItem[] = [];
  for (const item of items) {
    const label = labels.get(keyOf(item.type, item.id)) as string;
    const links = { before: await linksOf(item.type, item.before), after: await linksOf(item.type, item.after) };
    const parent = await parentOf(item.type, item.id, item.after);
    described.push({ op: item.op, type: item.type, label, before: item.before, after: item.after, links, parent });
  }
  return described;
}

/** What the apply step stores for an item (`changeset_items.detail`). */
export function itemDetail(item: PreviewItem): ItemDetail {
  return { links: item.links, parent: item.parent };
}
