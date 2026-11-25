import { modelInfo } from "@/lib/content-access";
import { bareLabel, changedFields, filledFields, isPublicText, showValue, withType, type Row } from "@/lib/changes/labels";

/**
 * The readout: one plain-words view of what a set of changes adds and changes. The MCP preview
 * (before apply) and the Changes page (after apply) both print it, from this one code, so they
 * cannot drift apart. It reads only what a changeset item stores: the type, the label, the
 * before and after rows, the names of linked records and the record the item sits under.
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
}

/** The record that an item is grouped under: its show, its work, its person. */
export interface ParentInfo {
  /** `Type:id`: two items with the same key share a heading. */
  key: string;
  type: string;
  label: string;
}

/** What the apply step stores in `changeset_items.detail`, so the Changes page needs no queries. */
export interface ItemDetail {
  links: { before: Record<string, LinkInfo>; after: Record<string, LinkInfo> };
  parent: ParentInfo | null;
}

export interface ReadoutItem {
  op: "create" | "update";
  type: string;
  label: string;
  before: Row | null;
  after: Row;
  /** For each field that points at a record: that record, by field. */
  links: ItemDetail["links"];
  parent: ParentInfo | null;
}

/** New records of these types are listed first, so the user can catch a duplicate. */
const NEW_RECORD_TYPES = new Set(["Person", "Place", "Work", "Band", "Subject", "Source"]);
/** Fields that are not worth a line: system values, and flags that the readout words itself. */
const SKIPPED_FIELDS = new Set(["sortKey", "legacyId", "isPublic", "wordsPublic"]);
const MAX_UNUSUAL = 25;
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
function countList(counts: Map<string, number>): string {
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
function plainValue(value: unknown, full: boolean): string {
  if (typeof value === "string" && /^[A-Z][A-Z0-9_]+$/.test(value)) return value.toLowerCase().replace(/_/g, " ");
  return showValue(value, full);
}

/**
 * A field value as text. A link shows the ID with the name of the record, `1485 (Beedle Um Bum)`.
 * A link to a record made in the same call shows `(new) Note "..."`.
 */
function showField(value: unknown, link: LinkInfo | undefined, full: boolean): string {
  if (!link) return plainValue(value, full);
  return link.isNew ? `(new) ${withType(link.type, link.label)}` : `${String(value)} (${link.name})`;
}

/** The field name in words: `workId` reads `work`, `timeLabel` reads `time label`. */
function fieldName(field: string): string {
  return words(field.replace(/Id$/, ""));
}

/** Who can see a record, in words. Null when the type has no public flag. */
function visibility(type: string, row: Row | null): string | null {
  if (!row) return null;
  if (type === "Note") return row.isPublic === true ? "public note" : "private note";
  if (type === "Segment") {
    return row.isPublic === false ? "not public" : `public: summary and references · words: ${row.wordsPublic === true ? "public" : "private"}`;
  }
  return "isPublic" in row ? (row.isPublic === false ? "not public" : "public") : null;
}

interface Part {
  text: string;
  /** The column the text is about, when it is about one. */
  field?: string;
  /** True when the field changed from one value to another, not only filled in. */
  overwrite?: boolean;
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
function fillParts(item: ReadoutItem): Part[] {
  const parts: Part[] = [];
  for (const [field, value] of inModelOrder(item.type, filledFields(item.type, item.after))) {
    // The label already says a name, title or short body: do not print it twice.
    if (SKIPPED_FIELDS.has(field) || value === bareLabel(item.type, item.label)) continue;
    const full = isPublicText(item.type, field, item.after);
    parts.push({ field, text: `${fieldName(field)}: ${showField(value, item.links.after[field], full)}` });
  }
  const seen = visibility(item.type, item.after);
  // A public record is the usual case: only a note and a segment always say who sees them.
  if (seen && (item.type === "Note" || item.type === "Segment" || seen === "not public")) parts.push({ text: seen });
  return parts;
}

/** The fields of a changed record, as before → after. */
function changeParts(item: ReadoutItem): Part[] {
  const before = item.before ?? {};
  const parts: Part[] = [];
  for (const [field, from, to] of inModelOrder(item.type, changedFields(before, item.after))) {
    if (SKIPPED_FIELDS.has(field)) continue;
    const text = `${fieldName(field)}: ${showField(from, item.links.before[field], isPublicText(item.type, field, item.before))} → ${showField(to, item.links.after[field], isPublicText(item.type, field, item.after))}`;
    parts.push({ field, text, overwrite: !isEmpty(from) });
  }
  const was = visibility(item.type, item.before);
  const now = visibility(item.type, item.after);
  if (was !== now && was !== null && now !== null) parts.push({ text: `who can see it: ${was} → ${now}`, overwrite: true });
  return parts;
}

const nameOf = (link: LinkInfo | undefined, fallback: unknown) => link?.name ?? String(fallback);

/** A reference reads as a sentence: `Ripple mentions San Francisco Bay`. */
function referenceHead(item: ReadoutItem): { head: string; skip: Set<string> } | null {
  const { after, links } = item;
  const kind = links.after.referenceKindId;
  if (item.type !== "Reference" || !kind || !links.after.fromId || !links.after.toId) return null;
  const sentence = `${nameOf(links.after.fromId, after.fromId)} ${kind.name} ${nameOf(links.after.toId, after.toId)}`;
  return { head: `Reference: ${sentence}`, skip: new Set(["fromId", "toId", "referenceKindId"]) };
}

/** A bill entry reads `Bill: Roadhog (headliner)`. */
function billHead(item: ReadoutItem): { head: string; skip: Set<string> } | null {
  const act = item.links.after.actBandId ?? item.links.after.actPersonId;
  if (item.type !== "BillEntry" || !act || typeof item.after.role !== "string") return null;
  return { head: `Bill: ${act.name} (${plainValue(item.after.role, false)})`, skip: new Set(["actBandId", "actPersonId", "role"]) };
}

/** One plain line for one record. */
function recordLine(item: ReadoutItem): string {
  const special = item.op === "create" ? (referenceHead(item) ?? billHead(item)) : null;
  const head = special?.head ?? withType(item.type, item.label);
  const parts = (item.op === "create" ? fillParts(item) : changeParts(item)).filter((part) => !(special && part.field && special.skip.has(part.field)));
  return [`${item.op === "create" ? "New" : "Changed"} ${head}`, ...parts.map((p) => p.text)].join(" · ");
}

/** The lines worth the user's eye: new shared records, overwritten values, doubtful certainty. */
function unusualLines(items: ReadoutItem[]): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const name = withType(item.type, item.label);
    if (item.op === "create" && NEW_RECORD_TYPES.has(item.type)) {
      lines.push(`New ${words(item.type)}: ${bareLabel(item.type, item.label)}`);
    }
    const overwritten = item.op === "update" ? changeParts(item).filter((p) => p.overwrite) : [];
    if (overwritten.length > 0) lines.push(`Changed value in ${name} · ${overwritten.map((p) => p.text).join(" · ")}`);
    const before = item.before ?? {};
    for (const [field, value] of Object.entries(item.after)) {
      if (!/certainty$/i.test(field) || isEmpty(value) || value === "CONFIRMED" || before[field] === value) continue;
      lines.push(`Not confirmed: ${name} · ${words(field)}: ${plainValue(value, false)}`);
    }
  }
  return lines;
}

/** The counts sentence, for the top of the readout and for each line of the Changes page. */
export function countsSentence(items: ReadoutItem[]): string {
  if (items.length === 0) return "No changes.";
  const created = items.filter((i) => i.op === "create");
  const updated = items.filter((i) => i.op === "update");
  const madeHere = new Set(created.map((i) => `${i.type}:${String(i.after.id)}`));
  const parents = new Map<string, ParentInfo>();
  for (const item of created) {
    const parent = item.parent;
    if (parent && !madeHere.has(parent.key) && !parents.has(parent.key)) parents.set(parent.key, parent);
  }
  const sentences: string[] = [];
  if (created.length > 0) {
    const where = parents.size > 0 ? ` to ${countList(tally([...parents.values()].map((p) => p.type)))}` : "";
    sentences.push(`Added ${countList(tally(created.map((i) => i.type)))}${where}`);
  }
  if (updated.length > 0) sentences.push(`Changed ${countList(tally(updated.map((i) => i.type)))}`);
  const fresh = created.filter((i) => NEW_RECORD_TYPES.has(i.type)).length;
  if (fresh > 0) sentences.push(`${fresh} ${fresh === 1 ? "is a new person, place, work, band, subject or source" : "are new people, places, works, bands, subjects or sources"}`);
  return `${sentences.join("; ")}.`;
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

/**
 * The readout as plain text: the counts, the unusual lines, then one heading per parent with
 * one line per record. This is the one place that words a set of changes: change it here only.
 */
export function formatReadout(items: ReadoutItem[]): string {
  const lines = [countsSentence(items)];
  if (items.length === 0) return lines[0];
  const unusual = unusualLines(items);
  lines.push("");
  if (unusual.length === 0) {
    lines.push("Nothing unusual.");
  } else {
    lines.push("Look at these first:");
    for (const line of unusual.slice(0, MAX_UNUSUAL)) lines.push(`- ${line}`);
    if (unusual.length > MAX_UNUSUAL) lines.push(`- ...and ${unusual.length - MAX_UNUSUAL} more. They are in the list below.`);
  }
  for (const group of groupItems(items)) {
    lines.push("", group.heading);
    for (const item of group.items) lines.push(`- ${recordLine(item)}`);
  }
  return lines.join("\n");
}

/** Build the items of a stored changeset: its rows, and the detail that the apply step saved. */
export function storedReadoutItem(
  item: { type: string; label: string; action: string; before: Row | null; after: Row | null; detail: ItemDetail | null },
): ReadoutItem {
  return {
    op: item.action === "CREATE" ? "create" : "update",
    type: item.type,
    label: item.label,
    before: item.before,
    after: item.after ?? {},
    links: item.detail?.links ?? { before: {}, after: {} },
    parent: item.detail?.parent ?? null,
  };
}
