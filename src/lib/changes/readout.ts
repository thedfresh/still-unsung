import { LIST_TABLES, modelInfo } from "@/lib/content-access";
import { bareLabel, changedFields, filledFields, isPrivateText, showValue, withType, type Row } from "@/lib/changes/labels";

/**
 * The readout: one plain-words view of what a set of changes adds and changes. The MCP preview
 * (before apply) and the Changes page (after apply) both print it, from this one code, so they
 * cannot drift apart. It reads only what a changeset item stores: the type, the label, the
 * before and after rows, the names of linked records and the record the item sits under.
 *
 * `buildReadout` makes the structure (cards under headings). `renderReadout` prints it as
 * plain text for the preview; the Changes page draws the same structure as cards.
 */

/** The record a field points at. */
export interface LinkInfo {
  type: string;
  /** The readable name with its type, for example `Work "Ripple"`. */
  label: string;
  /** The name alone, for example `Ripple`. */
  name: string;
  /** True when the record is created in the same call: it has no final ID yet. */
  isNew: boolean;
  /** True when the record is gone: the lookup ran and found nothing. Then `label` and `name` are empty. */
  deleted?: boolean;
}

/** The record that an item is grouped under: its show, its work, its person. */
export interface ParentInfo {
  /** `Type:id`: two items with the same key share a heading. */
  key: string;
  type: string;
  label: string;
}

/** What the apply step stores in `changeset_items.detail`, so the Changes page needs few queries. */
export interface ItemDetail {
  links: { before: Record<string, LinkInfo>; after: Record<string, LinkInfo> };
  parent: ParentInfo | null;
}

export interface ReadoutItem {
  op: "create" | "update" | "delete";
  type: string;
  label: string;
  before: Row | null;
  after: Row;
  /** For each field that points at a record: that record, by field. */
  links: ItemDetail["links"];
  parent: ParentInfo | null;
  /** The show that the record sits in, when it has a show page. Only the pending preview page sets it. */
  showId?: number | null;
}

/** One line of a card: a value, or a before and after pair. */
export interface ReadoutField {
  name: string;
  value?: string;
  was?: string;
  now?: string;
  /** True when the field changed from one value to another, not only filled in. */
  overwrite?: boolean;
}

/** One record, as a heading and its fields. */
export interface ReadoutCard {
  /** `New`, `Changed`, `Moved` or `Deleted`. Empty for a "look at these first" card that is one sentence. */
  action: string;
  title: string;
  fields: ReadoutField[];
  /** The show whose page the card links to, when there is one. */
  showId?: number;
}

export interface Readout {
  counts: string;
  unusual: ReadoutCard[];
  /** How many unusual cards are left out of `unusual`. */
  unusualMore: number;
  groups: Array<{ heading: string; cards: ReadoutCard[] }>;
}

/** The group for an item stored before the grouping was stored. */
export const EARLIER_KEY = "earlier";
const EARLIER: ParentInfo = { key: EARLIER_KEY, type: "Earlier change", label: "Earlier change (no grouping stored)" };

/** New records of these types are listed first, so the user can catch a duplicate. */
const NEW_RECORD_TYPES = new Set<string>(["Person", "Place", "Work", "Band", "Subject", "Source", ...LIST_TABLES]);
/** Fields that are not worth a line: system values, and flags that the readout words itself. */
const SKIPPED_FIELDS = new Set(["sortKey", "legacyId", "isPublic", "wordsPublic"]);
/** Fields that say where a record sits: its parent and its order. */
const MOVE_FIELDS = new Set(["segmentId", "parentId", "setId", "showId", "entityId", "lineupEntryId", "fromId", "sortKey", "position"]);
const MAX_UNUSUAL = 25;
/** Text values are cut at this length. */
const TEXT_MAX = 100;
const IRREGULAR_PLURALS: Record<string, string> = { person: "people" };

/** `PortionEntry` becomes `portion entry`. */
function words(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
}

function plural(word: string, count: number): string {
  if (count === 1) return word;
  if (IRREGULAR_PLURALS[word]) return IRREGULAR_PLURALS[word];
  return /[^aeiou]y$/.test(word) ? `${word.slice(0, -1)}ies` : `${word}s`;
}

/** `53 segments and 82 references`. */
export function countList(counts: Map<string, number>): string {
  const parts = [...counts].map(([type, n]) => `${n} ${plural(words(type), n)}`);
  return parts.length < 2 ? parts.join("") : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

function tally(types: string[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const type of types) out.set(type, (out.get(type) ?? 0) + 1);
  return out;
}

const isEmpty = (value: unknown) => value === null || value === undefined || value === "" || (Array.isArray(value) && value.length === 0);

/** A value as plain text. An all-capitals enum value reads as words: `CO_BILL` is `co bill`. */
function plainValue(value: unknown): string {
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]+$/.test(value)) return value.toLowerCase().replace(/_/g, " ");
  return showValue(value, false, TEXT_MAX);
}

/** The field name in words: `workId` reads `work`, `timeLabel` reads `time label`. */
function fieldName(field: string): string {
  return words(field.replace(/Id$/, ""));
}

/** The type that a field points at, or null when the field is not a link. */
function targetType(type: string, field: string): string | null {
  return field === "id" ? null : (modelInfo(type)?.fields[field]?.fk ?? null);
}

/**
 * A field value as text. A link shows the name of the record, never its ID: `Beedle Um Bum`. A
 * link to a shared record shows its type too. A link to a record made in the same call reads
 * `(new) Note "..."`. An ID shows only when there is no name: `(deleted record 14180)` when the
 * record is gone, `(record 14180, name not found)` when the lookup found no name for another reason.
 */
function showField(type: string, field: string, value: unknown, link: LinkInfo | undefined): string {
  if (link?.deleted) return `(deleted record ${String(value)})`;
  if (link) {
    if (link.isNew) return `(new) ${withType(link.type, link.label)}`;
    return targetType(type, field) === "Entity" ? withType(link.type, link.label) : link.name;
  }
  if (typeof value === "number" && targetType(type, field)) return `(record ${value}, name not found)`;
  return plainValue(value);
}

/** Who can see a record, in words. Null when the type has no public flag, or the row has no value for it. */
function visibility(type: string, row: Row | null): string | null {
  if (!row || !("isPublic" in row)) return null;
  if (type === "Note") return row.isPublic === true ? "public note" : "private note";
  if (type === "Segment") {
    return row.isPublic === false ? "not public" : `public: summary and references · words: ${row.wordsPublic === true ? "public" : "private"}`;
  }
  return row.isPublic === false ? "not public" : "public";
}

/**
 * Sort entries in the order of the model's columns. A stored JSON column does not keep the order
 * of its keys, and the preview and the Changes page must print the same lines.
 */
function inModelOrder<T extends [string, ...unknown[]]>(type: string, entries: T[]): T[] {
  const order = Object.keys(modelInfo(type)?.fields ?? {});
  const rank = (field: string) => (order.includes(field) ? order.indexOf(field) : order.length);
  return [...entries].sort((a, b) => rank(a[0]) - rank(b[0]) || a[0].localeCompare(b[0]));
}

/** The fields of a new record, in words. A default or an empty value has no line. */
function fillFields(item: ReadoutItem, skip: Set<string>): ReadoutField[] {
  const fields: ReadoutField[] = [];
  for (const [field, value] of inModelOrder(item.type, filledFields(item.type, item.after))) {
    // The label already says a name, title or short body: do not print it twice.
    if (SKIPPED_FIELDS.has(field) || skip.has(field) || value === bareLabel(item.type, item.label)) continue;
    fields.push({ name: privateName(item, field, fieldName(field)), value: showField(item.type, field, value, item.links.after[field]) });
  }
  const seen = visibility(item.type, item.after);
  // A public record is the usual case: only a note and a segment always say who sees them.
  if (seen && (item.type === "Note" || item.type === "Segment" || seen === "not public")) fields.push({ name: "who can see it", value: seen });
  return fields;
}

/** The field name, with "(private)" after it for a field that the schema marks private. */
function privateName(item: ReadoutItem, field: string, name: string): string {
  return isPrivateText(item.type, field, item.after) ? `${name} (private)` : name;
}

/** A changed text field: the old and the new value on two lines, each cut at about 100 characters. */
function textChange(item: ReadoutItem, field: string, from: unknown, to: unknown): ReadoutField {
  const name = privateName(item, field, fieldName(field));
  if (isEmpty(from)) return { name, value: plainValue(to) };
  return { name, was: plainValue(from), now: plainValue(to), overwrite: true };
}

/** The fields of a changed record, as before → after. */
function changeFields(item: ReadoutItem): ReadoutField[] {
  const before = item.before ?? {};
  const fields: ReadoutField[] = [];
  for (const [field, from, to] of inModelOrder(item.type, changedFields(before, item.after))) {
    if (SKIPPED_FIELDS.has(field)) continue;
    const name = privateName(item, field, fieldName(field));
    const isText = (typeof from === "string" || typeof to === "string") && !/^[A-Z][A-Z0-9_]+$/.test(String(to));
    const longText = isText && (String(from ?? "").length > 40 || String(to ?? "").length > 40 || isPrivateText(item.type, field, item.after));
    if (longText) {
      fields.push(textChange(item, field, from, to));
    } else if (isEmpty(from)) {
      fields.push({ name, value: showField(item.type, field, to, item.links.after[field]) });
    } else if (targetType(item.type, field)) {
      // A moved link reads on one line, in names.
      const was = showField(item.type, field, from, item.links.before[field]);
      const now = showField(item.type, field, to, item.links.after[field]);
      fields.push({ name, value: `${was} → ${now}`, overwrite: true });
    } else {
      fields.push({ name, was: plainValue(from), now: plainValue(to), overwrite: true });
    }
  }
  const was = visibility(item.type, item.before);
  const now = visibility(item.type, item.after);
  if (was !== now && was !== null && now !== null) fields.push({ name: "who can see it", value: `${was} → ${now}`, overwrite: true });
  return fields;
}

const nameOf = (link: LinkInfo | undefined, fallback: unknown) =>
  link?.deleted ? `(deleted record ${String(fallback)})` : (link?.name ?? `(record ${String(fallback)}, name not found)`);

/** A reference reads as a sentence: `Ripple mentions San Francisco Bay`. */
function referenceHead(item: ReadoutItem): { head: string; skip: Set<string> } | null {
  const { after, links } = item;
  const kind = links.after.referenceKindId;
  if (item.type !== "Reference" || !kind || !links.after.fromId || !links.after.toId) return null;
  const sentence = `${nameOf(links.after.fromId, after.fromId)} ${kind.name} ${nameOf(links.after.toId, after.toId)}`;
  return { head: sentence, skip: new Set(["fromId", "toId", "referenceKindId"]) };
}

/** A bill entry reads `Bill: Roadhog (headliner)`. */
function billHead(item: ReadoutItem): { head: string; skip: Set<string> } | null {
  const act = item.links.after.actBandId ?? item.links.after.actPersonId;
  if (item.type !== "BillEntry" || !act || typeof item.after.role !== "string") return null;
  return { head: `${act.name} (${plainValue(item.after.role)})`, skip: new Set(["actBandId", "actPersonId", "role"]) };
}

/** The record's name for a card title: a reference reads as its sentence, a bill entry as its act. */
function recordTitle(item: ReadoutItem): { title: string; skip: Set<string> } {
  const reference = referenceHead(item);
  if (reference) return { title: `Reference: ${reference.head}`, skip: reference.skip };
  const bill = billHead(item);
  if (bill) return { title: `Bill: ${bill.head}`, skip: bill.skip };
  return { title: withType(item.type, item.label), skip: new Set() };
}

/** The key fields of a deleted record, as it was before: the same lines as a new record, with the old links. */
function deletedFields(item: ReadoutItem, skip: Set<string>): ReadoutField[] {
  const was = item.before ?? item.after;
  return fillFields({ ...item, after: was, links: { ...item.links, after: item.links.before } }, skip);
}

/** One card for one record. */
function recordCard(item: ReadoutItem): ReadoutCard {
  const card = recordCardBody(item);
  return item.showId ? { ...card, showId: item.showId } : card;
}

function recordCardBody(item: ReadoutItem): ReadoutCard {
  const { title, skip } = recordTitle(item);
  if (item.op === "delete") return { action: "", title: `Deleted · ${title}`, fields: deletedFields(item, skip) };
  if (item.op === "create") {
    return { action: "New", title, fields: fillFields(item, skip) };
  }
  const fields = changeFields(item);
  const changed = changedFields(item.before ?? {}, item.after);
  // Moved means a change of place only: the parent or the order. A changed work or subject is a change.
  const moved = changed.length > 0 && changed.every(([field]) => MOVE_FIELDS.has(field));
  return { action: moved ? "Moved" : "Changed", title, fields };
}

/** The sentence a "not confirmed" line is about: a reference as its sentence, else the record. */
function aboutRecord(item: ReadoutItem): string {
  return referenceHead(item)?.head ?? withType(item.type, item.label);
}

/** The cards worth the user's eye: new shared records, overwritten values, doubtful certainty, deletes. */
function unusualCards(items: ReadoutItem[]): ReadoutCard[] {
  const cards: ReadoutCard[] = [];
  for (const item of items) {
    const name = withType(item.type, item.label);
    if (item.op === "create" && NEW_RECORD_TYPES.has(item.type)) {
      cards.push({ action: "", title: `New ${words(item.type)}: ${bareLabel(item.type, item.label)}`, fields: [] });
    }
    if (item.op === "delete") {
      const { title, skip } = recordTitle(item);
      cards.push({ action: "", title: `Deleted · ${title}`, fields: deletedFields(item, skip) });
    }
    const overwritten = item.op === "update" ? changeFields(item).filter((f) => f.overwrite) : [];
    if (overwritten.length > 0) cards.push({ action: "", title: `Changed value in ${name}`, fields: overwritten });
    if (item.op === "delete") continue;
    const before = item.before ?? {};
    for (const [field, value] of inModelOrder(item.type, Object.entries(item.after))) {
      if (!/certainty$/i.test(field) || isEmpty(value) || value === "CONFIRMED" || before[field] === value) continue;
      cards.push({ action: "", title: `Not confirmed: ${aboutRecord(item)} · ${fieldName(field)}: ${plainValue(value)}`, fields: [] });
    }
  }
  return cards;
}

/** The counts sentence, for the top of the readout and for each line of the Changes page. */
export function countsSentence(items: ReadoutItem[]): string {
  if (items.length === 0) return "No changes.";
  const created = items.filter((i) => i.op === "create");
  const updated = items.filter((i) => i.op === "update");
  const deleted = items.filter((i) => i.op === "delete");
  const madeHere = new Set(created.map((i) => `${i.type}:${String(i.after.id)}`));
  const parents = new Map<string, ParentInfo>();
  for (const item of created) {
    const parent = item.parent;
    if (parent && parent.key !== EARLIER_KEY && !madeHere.has(parent.key) && !parents.has(parent.key)) parents.set(parent.key, parent);
  }
  const sentences: string[] = [];
  if (created.length > 0) {
    const where = parents.size > 0 ? ` to ${countList(tally([...parents.values()].map((p) => p.type)))}` : "";
    sentences.push(`Added ${countList(tally(created.map((i) => i.type)))}${where}`);
  }
  if (updated.length > 0) sentences.push(`changed ${countList(tally(updated.map((i) => i.type)))}`);
  if (deleted.length > 0) sentences.push(`deleted ${countList(tally(deleted.map((i) => i.type)))}`);
  const fresh = created.filter((i) => NEW_RECORD_TYPES.has(i.type)).length;
  if (fresh > 0) sentences.push(`${fresh} new ${fresh === 1 ? "record" : "records"}`);
  const text = sentences.join("; ");
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** The items grouped under one heading per parent, in the order each parent first appears. */
function groupItems(items: ReadoutItem[]): Array<{ heading: string; items: ReadoutItem[] }> {
  const groups = new Map<string, { heading: string; items: ReadoutItem[] }>();
  for (const item of items) {
    const key = item.parent?.key ?? `${item.type}:${String(item.after.id)}`;
    const heading = item.parent ? withType(item.parent.type, item.parent.label) : withType(item.type, item.label);
    const group = groups.get(key) ?? { heading, items: [] };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups.values()];
}

/** The readout as a structure: the counts, the unusual cards, then one heading per parent with its cards. */
export function buildReadout(items: ReadoutItem[]): Readout {
  const unusual = unusualCards(items);
  return {
    counts: countsSentence(items),
    unusual: unusual.slice(0, MAX_UNUSUAL),
    unusualMore: Math.max(0, unusual.length - MAX_UNUSUAL),
    groups: groupItems(items).map((group) => ({ heading: group.heading, cards: group.items.map(recordCard) })),
  };
}

/** The text of one card: the title line, then each field indented by two spaces. */
function cardLines(card: ReadoutCard): string[] {
  const lines = [card.action ? `${card.action} ${card.title}` : card.title];
  for (const field of card.fields) {
    if (field.was !== undefined) lines.push(`  ${field.name}`, `    was: ${field.was}`, `    now: ${field.now}`);
    else lines.push(`  ${field.name}: ${field.value}`);
  }
  return lines;
}

/**
 * The readout as plain text: the counts, the unusual cards, then one heading per parent with
 * its cards. This is the one place that words a set of changes: change it here only.
 */
export function renderReadout(readout: Readout): string {
  const lines = [readout.counts];
  if (readout.groups.length === 0) return lines[0];
  lines.push("");
  if (readout.unusual.length === 0) {
    lines.push("Nothing unusual.");
  } else {
    lines.push("Look at these first:");
    for (const card of readout.unusual) {
      const [first, ...rest] = cardLines(card);
      lines.push(`- ${first}`, ...rest.map((line) => `  ${line}`));
    }
    if (readout.unusualMore > 0) lines.push(`- …and ${readout.unusualMore} more. They are in the list below.`);
  }
  for (const group of readout.groups) {
    lines.push("", group.heading);
    for (const card of group.cards) lines.push(...cardLines(card).map((line) => `  ${line}`));
  }
  return lines.join("\n");
}

export function formatReadout(items: ReadoutItem[]): string {
  return renderReadout(buildReadout(items));
}

/**
 * Build the item of a stored changeset: its rows, and the detail that the apply step saved. An
 * item stored before the detail existed has no grouping: it goes in one "earlier change" group.
 * The caller may pass links that it looked up for such an item.
 */
export function storedReadoutItem(
  item: { type: string; label: string; action: string; before: Row | null; after: Row | null; detail: ItemDetail | null },
): ReadoutItem {
  return {
    op: item.action === "CREATE" ? "create" : item.action === "DELETE" ? "delete" : "update",
    type: item.type,
    label: item.label,
    before: item.before,
    after: item.after ?? item.before ?? {},
    links: item.detail?.links ?? { before: {}, after: {} },
    parent: item.detail?.parent ?? EARLIER,
  };
}
