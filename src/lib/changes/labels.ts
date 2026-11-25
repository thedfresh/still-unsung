export type Row = Record<string, unknown>;

const NAME_FIELDS = ["name", "title", "displayName", "label", "slug", "value", "body"] as const;
const HIDDEN_FIELDS = new Set(["id", "rev", "createdAt", "updatedAt"]);

function datePart(row: Row): string | null {
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

/** Plain words for enum values that the raw name would make hard to read. */
const PLAIN_VALUES: Record<string, string> = { RECORDING_PLAYED: "recording played" };

/** One value as plain text for the preview. */
export function showValue(value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (typeof value === "string" && value in PLAIN_VALUES) return PLAIN_VALUES[value];
  if (typeof value === "string") return JSON.stringify(value.length > 200 ? `${value.slice(0, 197)}...` : value);
  return String(value);
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

/** The fields of a new record that hold a value, for the preview. */
export function filledFields(after: Row): Array<[string, unknown]> {
  return Object.entries(after).filter(([key, value]) => !HIDDEN_FIELDS.has(key) && value !== null && value !== undefined);
}
