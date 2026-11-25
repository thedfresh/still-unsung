import { modelInfo } from "@/lib/content-access";

export type Row = Record<string, unknown>;

const NAME_FIELDS = ["name", "title", "displayName", "label", "slug", "value", "body"] as const;
const HIDDEN_FIELDS = new Set(["id", "rev", "createdAt", "updatedAt"]);

export function datePart(row: Row): string | null {
  const { dateYear, dateMonth, dateDay } = row;
  if (typeof dateYear !== "number") return typeof row.dateAsWritten === "string" ? row.dateAsWritten : null;
  const two = (n: number) => String(n).padStart(2, "0");
  if (typeof dateMonth !== "number") return String(dateYear);
  if (typeof dateDay !== "number") return `${dateYear}-${two(dateMonth)}`;
  return `${dateYear}-${two(dateMonth)}-${two(dateDay)}`;
}

/**
 * A readable name for a record, for example `Show 1978-05-23, Keystone`. `extra` is a place name
 * the caller looked up for a show. `withId` is false for a new record: its trial ID is not the final one.
 */
export function describeRecord(type: string, row: Row | null, extra?: string | null, withId = true): string {
  if (!row) return type;
  if (type === "Show") {
    const date = datePart(row);
    if (date !== null || extra) return ["Show", [date, extra].filter(Boolean).join(", ")].join(" ");
  }
  for (const field of NAME_FIELDS) {
    const value = row[field];
    if (typeof value === "string" && value.length > 0) {
      const short = value.length > 50 ? `${value.slice(0, 47)}...` : value;
      return `${type} "${short}"`;
    }
  }
  const date = datePart(row);
  if (date !== null) return `${type} ${date}`;
  return withId && typeof row.id === "number" ? `${type} #${row.id}` : type;
}

const SUMMARY_LABEL_MAX = 80;

/**
 * A segment as its work title (or "[spoken]") and the date of its show, for example
 * `Ripple, 1978-05-23`. A spoken segment, or one with no work, that has a summary reads by the
 * summary (cut to about 80 characters). A recording played keeps its song label.
 */
export function segmentLabel(
  workTitle: string | null,
  showDate: string | null,
  talk?: { delivery?: unknown; summary?: unknown },
): string {
  const summary = typeof talk?.summary === "string" ? talk.summary.replace(/\s+/g, " ").trim() : "";
  const byTalk = summary !== "" && talk?.delivery !== "RECORDING_PLAYED" && (talk?.delivery === "SPOKEN" || workTitle === null);
  const text = byTalk ? summary : (workTitle ?? "[spoken]");
  const title = byTalk && text.length > SUMMARY_LABEL_MAX ? `${text.slice(0, SUMMARY_LABEL_MAX - 3)}...` : text;
  return showDate ? `${title}, ${showDate}` : title;
}

/** A set as the date of its show and its position, for example `1978-05-23, set 1`. */
export function setLabel(row: Row, showDate: string | null): string | null {
  if (typeof row.position !== "number") return null;
  return [showDate, `set ${row.position}`].filter(Boolean).join(", ");
}

/** A label for a list or a message: starts with the type unless the label already does. */
export function withType(type: string, label: string): string {
  return label === type || label.startsWith(`${type} `) ? label : `${type}: ${label}`;
}

/** Plain words for enum values that the raw name would make hard to read. */
const PLAIN_VALUES: Record<string, string> = { RECORDING_PLAYED: "recording played" };

/**
 * One value as plain text for the preview. A long string is cut at 200 characters unless `full`
 * is true (public text, which the user must read whole before it goes live).
 */
export function showValue(value: unknown, full = false): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string" && value in PLAIN_VALUES) return PLAIN_VALUES[value];
  if (typeof value === "string") return JSON.stringify(!full && value.length > 200 ? `${value.slice(0, 197)}...` : value);
  return String(value);
}

/** True for a text field that goes on a public page: a public note's body and a segment summary. */
export function isPublicText(type: string, field: string, row: Row | null): boolean {
  if (type === "Segment") return field === "summary";
  return type === "Note" && field === "body" && row?.isPublic === true;
}

/** A record label without its type, for example `Work "Ripple"` becomes `Ripple`. */
export function bareLabel(type: string, label: string): string {
  const rest = label.startsWith(`${type} `) ? label.slice(type.length + 1) : label;
  return /^".*"$/.test(rest) ? rest.slice(1, -1) : rest;
}

/** The fields that differ between two versions of a record, as before → after. */
export function changedFields(before: Row, after: Row): Array<[string, unknown, unknown]> {
  const out: Array<[string, unknown, unknown]> = [];
  for (const key of Object.keys(after)) {
    if (HIDDEN_FIELDS.has(key)) continue;
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) out.push([key, before[key], after[key]]);
  }
  return out;
}

/**
 * The fields of a new record, for the preview. A field is left out when it is empty or equals
 * the column default: a default is not worth a line (admin notes, "Defaults are not stored").
 */
export function filledFields(type: string, after: Row): Array<[string, unknown]> {
  const fields = modelInfo(type)?.fields ?? {};
  return Object.entries(after).filter(([key, value]) => {
    if (HIDDEN_FIELDS.has(key) || value === null || value === undefined) return false;
    // The public mark of a shared record lives on its `entities` row and defaults to true.
    const fallback = key === "isPublic" && !fields[key] ? true : fields[key]?.default;
    return fallback === undefined || JSON.stringify(fallback) !== JSON.stringify(value);
  });
}
