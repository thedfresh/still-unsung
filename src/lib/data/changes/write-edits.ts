import { AppError } from "@/lib/errors";
import { withType, type Row } from "@/lib/changes/labels";
import { countList } from "@/lib/changes/readout";
import { isList, MODEL, modelInfo, usesEntityPublicFlag } from "@/lib/content-access";
import type { FieldValue, ParsedEdit } from "@/lib/validation/content";
import { placeSegment } from "@/lib/data/changes/placement";
import { delegateOf, labelRow, readRow, type Tx } from "@/lib/data/changes/rows";

export interface AppliedItem {
  index: number;
  op: "create" | "update" | "delete";
  type: string;
  id: number;
  expectedRev: number | null;
  before: Row | null;
  /** Null for a delete: the record is gone. */
  after: Row | null;
}

/** A record that changed since the agent read it: both versions are kept to show the user. */
export interface VersionConflict {
  index: number;
  type: string;
  id: number;
  expectedRev: number;
  /** Null when the record no longer exists. */
  current: Row | null;
  proposed: Record<string, unknown>;
}

/** Thrown to stop a write and roll it back when a version check fails. */
export class ConflictAbort extends Error {
  constructor(readonly conflicts: VersionConflict[]) {
    super("The record changed since it was read.");
  }
}

function isRef(value: FieldValue): value is { ref: string } {
  return value !== null && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value);
}

/** Replace each `{ ref }` with the ID of the new record it names. */
function resolveRefs(fields: Record<string, FieldValue>, refIds: Map<string, number>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(fields)) out[name] = isRef(value) ? refIds.get(value.ref) : value;
  return out;
}

/** Turn a database error into a fixed, safe message that names the edit. */
function mapDbError(err: unknown, index: number): unknown {
  const code = typeof err === "object" && err !== null && "code" in err ? (err as { code: unknown }).code : null;
  if (code === "P2002") return new AppError("conflict", `Edit ${index}: a value that must be unique is already taken.`);
  if (code === "P2003") return new AppError("invalid_input", `Edit ${index}: a record it points at does not exist.`);
  if (code === "P2025") return new AppError("not_found", `Edit ${index}: the record does not exist.`);
  return err;
}

/** Tell the agent about list values that do not exist. Only the admin adds list values. */
export async function findMissingListValues(tx: Tx, edits: ParsedEdit[]): Promise<string[]> {
  const warnings: string[] = [];
  for (const [index, edit] of edits.entries()) {
    for (const [name, value] of Object.entries(edit.fields)) {
      const target = modelInfo(edit.type).fields[name]?.fk;
      if (!target || !isList(target) || typeof value !== "number") continue;
      const found = await delegateOf(tx, target).findUnique({ where: { id: value }, select: { id: true } });
      if (!found) {
        warnings.push(`Edit ${index}: ${target} ${value} does not exist. Ask the user to add the value in the admin, then use its ID.`);
      }
    }
  }
  return warnings;
}

/** Compare every version the agent read with the stored one. Writes nothing. */
export async function findConflicts(tx: Tx, edits: ParsedEdit[]): Promise<VersionConflict[]> {
  const conflicts: VersionConflict[] = [];
  for (const [index, edit] of edits.entries()) {
    if (edit.op === "create" || edit.id === undefined || edit.rev === undefined) continue;
    const current = await readRow(tx, edit.type, edit.id);
    if (!current || current.rev !== edit.rev) {
      conflicts.push({ index, type: edit.type, id: edit.id, expectedRev: edit.rev, current, proposed: edit.fields });
    }
  }
  return conflicts;
}

async function createRecord(tx: Tx, index: number, edit: ParsedEdit, values: Record<string, unknown>): Promise<AppliedItem> {
  const info = modelInfo(edit.type);
  const entityFlag = usesEntityPublicFlag(edit.type);
  const { isPublic, ...others } = values;
  const data: Record<string, unknown> = entityFlag ? { ...others } : { ...values };
  if (info.entityKind) {
    const entity = await tx.entity.create({
      data: { kind: info.entityKind as "SHOW", isPublic: typeof isPublic === "boolean" ? isPublic : true },
    });
    data.id = entity.id;
  }
  const created = await delegateOf(tx, edit.type).create({ data });
  const id = created.id as number;
  const after = (await readRow(tx, edit.type, id)) ?? JSON.parse(JSON.stringify(created));
  return { index, op: "create", type: edit.type, id, expectedRev: null, before: null, after };
}

async function updateRecord(tx: Tx, index: number, edit: ParsedEdit, values: Record<string, unknown>): Promise<AppliedItem> {
  const id = edit.id as number;
  const before = await readRow(tx, edit.type, id);
  if (edit.type === "Source" && "title" in values && before?.zoteroKey != null) {
    throw new AppError("invalid_input", `Edit ${index}: this source is linked to Zotero, so its title is read-only. Change the title in Zotero.`);
  }
  const entityFlag = usesEntityPublicFlag(edit.type);
  const { isPublic, ...others } = values;
  const columns = entityFlag ? others : values;
  const result = await delegateOf(tx, edit.type).updateMany({
    where: { id, rev: edit.rev },
    data: { ...columns, rev: { increment: 1 } },
  });
  if (result.count !== 1 || !before) throw new ConflictAbort([{ index, type: edit.type, id, expectedRev: edit.rev as number, current: before, proposed: edit.fields }]);
  if (entityFlag && typeof isPublic === "boolean") await tx.entity.update({ where: { id }, data: { isPublic } });
  const after = (await readRow(tx, edit.type, id)) as Row;
  return { index, op: "update", type: edit.type, id, expectedRev: edit.rev ?? null, before, after };
}

/** The fields that point at a record of this type, by model: what can stay attached to it. */
function referrersOf(type: string): Map<string, string[]> {
  const kind = modelInfo(type).entityKind;
  const out = new Map<string, string[]>();
  for (const [model, info] of Object.entries(MODEL.models)) {
    // Backlinks and addresses are derived: the database removes them with the record.
    if (model === "Backlink" || model === "Address") continue;
    for (const [field, value] of Object.entries(info.fields)) {
      if (field === "id" || !value.fk) continue;
      if (value.fk === type || (kind !== null && value.fk === "Entity")) out.set(model, [...(out.get(model) ?? []), field]);
    }
  }
  return out;
}

/** What still points at a record: a count and the first few IDs for each type. Empty when nothing does. */
async function findAttached(tx: Tx, type: string, id: number): Promise<{ counts: Map<string, number>; examples: string[] }> {
  const counts = new Map<string, number>();
  const examples: string[] = [];
  for (const [model, fields] of referrersOf(type)) {
    const where = { OR: fields.map((field) => ({ [field]: id })) };
    const delegate = delegateOf(tx, model);
    const count = await delegate.count({ where });
    if (count === 0) continue;
    counts.set(model, count);
    const rows = await delegate.findMany({ where, select: { id: true }, take: 3 });
    examples.push(...rows.map((row) => `${model} ${String(row.id)}`));
  }
  return { counts, examples };
}

async function deleteRecord(tx: Tx, index: number, edit: ParsedEdit): Promise<AppliedItem> {
  const id = edit.id as number;
  const before = await readRow(tx, edit.type, id);
  if (!before) throw new AppError("not_found", `Edit ${index}: ${edit.type} ${id} does not exist.`);
  if (edit.rev !== undefined && before.rev !== edit.rev) {
    throw new ConflictAbort([{ index, type: edit.type, id, expectedRev: edit.rev, current: before, proposed: {} }]);
  }
  const attached = await findAttached(tx, edit.type, id);
  if (attached.counts.size > 0) {
    const name = withType(edit.type, await labelRow(tx, edit.type, before, true));
    throw new AppError(
      "invalid_input",
      `Edit ${index}: ${name} cannot be deleted. It still has ${countList(attached.counts)} attached (${attached.examples.join(", ")}). Delete them or move them to another record first, in the same call.`,
    );
  }
  const result = await delegateOf(tx, edit.type).deleteMany({ where: { id, ...(edit.rev === undefined ? {} : { rev: edit.rev }) } });
  if (result.count !== 1) throw new ConflictAbort([{ index, type: edit.type, id, expectedRev: edit.rev ?? 0, current: await readRow(tx, edit.type, id), proposed: {} }]);
  if (modelInfo(edit.type).entityKind) await tx.entity.deleteMany({ where: { id } });
  return { index, op: "delete", type: edit.type, id, expectedRev: edit.rev ?? null, before, after: null };
}

/**
 * Write the edits inside the open transaction. Creates and updates run in order; a new record can
 * point at an earlier new record. Deletes run last, in order, so a call can move the attachments
 * of a record and then delete it. The caller rolls the transaction back for a preview and
 * commits it for an apply.
 */
export async function writeEdits(tx: Tx, edits: ParsedEdit[]): Promise<AppliedItem[]> {
  const refIds = new Map<string, number>();
  const items: AppliedItem[] = [];
  const order = [...edits.entries()].sort(([, a], [, b]) => Number(a.op === "delete") - Number(b.op === "delete"));
  for (const [index, edit] of order) {
    try {
      if (edit.op === "delete") {
        items.push(await deleteRecord(tx, index, edit));
        continue;
      }
      const resolved = resolveRefs(edit.fields, refIds);
      const values = edit.placement ? await placeSegment(tx, index, edit.placement, resolved, refIds) : resolved;
      const item = edit.op === "create" ? await createRecord(tx, index, edit, values) : await updateRecord(tx, index, edit, values);
      if (edit.ref !== undefined) refIds.set(edit.ref, item.id);
      items.push(item);
    } catch (err) {
      throw mapDbError(err, index);
    }
  }
  return items;
}
