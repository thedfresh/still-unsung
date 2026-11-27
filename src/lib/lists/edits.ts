import type { ListConfig, ListField } from "@/lib/lists/config";

/** The value of one field in a form: text or a flag. */
export type FieldValue = string | boolean | null;
export type ListValues = Record<string, FieldValue>;

/** A value as the save wants it: an empty optional text is "not set" (null). */
function saved(field: ListField, value: FieldValue | undefined): string | boolean | null {
  if (field.kind === "boolean") return value === true;
  const text = typeof value === "string" ? value.trim() : "";
  return text === "" && !field.required && field.name !== "displayName" ? null : text;
}

/** The fields a person may edit. A read-only field is never sent. */
export function editableFields(config: ListConfig): ListField[] {
  return config.fields.filter((field) => !field.readOnly);
}

/** The first problem in a form, in words, or null. */
export function checkValues(config: ListConfig, values: ListValues): string | null {
  for (const field of editableFields(config)) {
    if (field.kind === "boolean") continue;
    const text = typeof values[field.name] === "string" ? (values[field.name] as string).trim() : "";
    if (field.required && text === "") return `Enter a value for "${field.label}".`;
  }
  return null;
}

/** The values of a blank form: empty text, the configured flag defaults, the first option. */
export function blankValues(config: ListConfig): ListValues {
  return Object.fromEntries(
    editableFields(config).map((field) => [
      field.name,
      field.kind === "boolean" ? (field.default ?? false) : field.kind === "select" ? (field.options?.[0] ?? "") : "",
    ]),
  );
}

/** A new value at the end of the list. */
export function createEdit(config: ListConfig, values: ListValues, position: number) {
  const fields: Record<string, unknown> = { position };
  for (const field of editableFields(config)) fields[field.name] = saved(field, values[field.name]);
  return { op: "create", type: config.type, fields };
}

/** An update of the fields that changed, or null when nothing changed. */
export function updateEdit(config: ListConfig, row: { id: number; rev: number; values: ListValues }, values: ListValues) {
  const fields: Record<string, unknown> = {};
  for (const field of editableFields(config)) {
    const next = saved(field, values[field.name]);
    if (next !== (row.values[field.name] ?? (field.kind === "boolean" ? false : null))) fields[field.name] = next;
  }
  return Object.keys(fields).length === 0 ? null : { op: "update", type: config.type, id: row.id, rev: row.rev, fields };
}

/** A delete of one value that no record uses. */
export function deleteEdit(config: ListConfig, row: { id: number; rev: number }) {
  return { op: "delete", type: config.type, id: row.id, rev: row.rev };
}

type Positioned = { id: number; rev: number; position: number };

const positionEdit = (config: Pick<ListConfig, "type">, row: Positioned, position: number) => ({
  op: "update",
  type: config.type,
  id: row.id,
  rev: row.rev,
  fields: { position },
});

/**
 * The updates that move one value up or down. Two neighbours with different positions swap
 * them: two edits. If the two share a position, the swap would change nothing, so the values
 * are renumbered in the new order and only those that need a new position are written. Returns
 * no edits when the move goes past an end.
 */
export function moveEdits(config: Pick<ListConfig, "type">, rows: Positioned[], id: number, direction: -1 | 1) {
  const from = rows.findIndex((row) => row.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= rows.length) return [];
  const [a, b] = [rows[from], rows[to]];
  if (a.position !== b.position) return [positionEdit(config, a, b.position), positionEdit(config, b, a.position)];
  const order = [...rows];
  [order[from], order[to]] = [order[to], order[from]];
  let last = Number.NEGATIVE_INFINITY;
  return order.flatMap((row) => {
    const position = row.position > last ? row.position : last + 1;
    last = position;
    return position === row.position ? [] : [positionEdit(config, row, position)];
  });
}
