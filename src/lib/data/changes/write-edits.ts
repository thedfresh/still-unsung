import { AppError } from "@/lib/errors";
import type { Row } from "@/lib/changes/labels";
import { isList, modelInfo, usesEntityPublicFlag } from "@/lib/content-access";
import type { Evidence, FieldValue, ParsedEdit } from "@/lib/validation/content";
import { delegateOf, readRow, type Tx } from "@/lib/data/changes/rows";

export interface AppliedItem {
  index: number;
  op: "create" | "update";
  type: string;
  id: number;
  expectedRev: number | null;
  before: Row | null;
  after: Row;
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
  return value !== null && typeof value === "object" && !(value instanceof Date);
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
    if (edit.op !== "update" || edit.id === undefined || edit.rev === undefined) continue;
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

/**
 * Write the edits in order inside the open transaction. A new record can point at an earlier
 * new record. The caller rolls the transaction back for a preview and commits it for an apply.
 */
export async function writeEdits(tx: Tx, edits: ParsedEdit[]): Promise<AppliedItem[]> {
  const refIds = new Map<string, number>();
  const items: AppliedItem[] = [];
  for (const [index, edit] of edits.entries()) {
    try {
      const values = resolveRefs(edit.fields, refIds);
      const item = edit.op === "create" ? await createRecord(tx, index, edit, values) : await updateRecord(tx, index, edit, values);
      if (edit.ref !== undefined) refIds.set(edit.ref, item.id);
      items.push(item);
    } catch (err) {
      throw mapDbError(err, index);
    }
  }
  return items;
}

/**
 * Write one citation for every shared record the call created or changed (data-model item 42).
 * "Own knowledge" writes none. The citations join the changeset as new records.
 */
export async function writeCitations(tx: Tx, items: AppliedItem[], evidence: Evidence, startIndex: number): Promise<AppliedItem[]> {
  if (evidence.ownKnowledge) return [];
  const out: AppliedItem[] = [];
  for (const item of items) {
    if (!modelInfo(item.type).entityKind) continue;
    const row = await tx.citation.create({
      data: {
        entityId: item.id,
        sourceId: evidence.sourceId,
        recordingId: evidence.recordingId,
        contributorId: evidence.contributorId,
        place: evidence.place,
      },
    });
    const after = JSON.parse(JSON.stringify(row)) as Row;
    out.push({ index: startIndex + out.length, op: "create", type: "Citation", id: row.id, expectedRev: null, before: null, after });
  }
  return out;
}
