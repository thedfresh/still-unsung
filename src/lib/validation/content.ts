import { z } from "zod";
import { isUpdatable, MODEL, modelInfo, SYSTEM_FIELDS, writeRefusal } from "@/lib/content-access";
import type { FieldInfo } from "@/lib/content-model-types";
import { AppError } from "@/lib/errors";

/**
 * Validation for edits to content records. It is built from the Prisma schema, so every content
 * table has the same checks. The admin forms and the MCP server share it.
 */

/** About 50 records per call (data-model item 40). */
export const MAX_EDITS = 50;

/** A pointer to a record created earlier in the same call. */
export interface RefValue {
  ref: string;
}

export type FieldValue = string | number | boolean | Date | null | RefValue;

export interface ParsedEdit {
  op: "create" | "update";
  type: string;
  /** A name other edits in the same call use to point at this new record. */
  ref?: string;
  id?: number;
  rev?: number;
  /** A new segment goes next to an existing or earlier new segment; the server makes its sort key. */
  placement?: { side: "before" | "after"; target: number | RefValue };
  fields: Record<string, FieldValue>;
}

const refSchema = z.object({ ref: z.string().min(1).max(60) }).strict();

function scalarSchema(name: string, info: FieldInfo): z.ZodType {
  if (info.enum) return z.enum(info.enum as [string, ...string[]]);
  switch (info.type) {
    case "Int":
      return name === "dateMonth" || name === "dateEndMonth"
        ? z.number().int().min(1).max(12)
        : name === "dateDay" || name === "dateEndDay"
          ? z.number().int().min(1).max(31)
          : z.number().int().min(-2147483648).max(2147483647);
    case "Boolean":
      return z.boolean();
    case "String":
      return z.string().max(info.maxLength ?? 20000);
    case "DateTime":
      if (info.dbType === "Date") return z.iso.date().transform((v) => new Date(`${v}T00:00:00.000Z`));
      if (info.dbType === "Time") {
        return z
          .string()
          .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use a time like 20:30 or 20:30:00.")
          .transform((v) => new Date(`1970-01-01T${v.length === 5 ? `${v}:00` : v}.000Z`));
      }
      return z.iso.datetime({ offset: true }).transform((v) => new Date(v));
    default:
      return z.never({ error: `A ${info.type} field cannot be set with this tool.` });
  }
}

function fieldSchema(name: string, info: FieldInfo, forCreate: boolean): z.ZodType {
  let schema = scalarSchema(name, info);
  if (info.fk) schema = z.union([schema, refSchema]);
  const nullable = !info.required;
  if (nullable) schema = schema.nullable();
  // On create, a field with a default or no requirement may be left out.
  return forCreate && (info.hasDefault || nullable) ? schema.optional() : schema;
}

/** The fields an agent may send for a type, with the rules for each. */
export function editableFields(type: string): Record<string, FieldInfo> {
  const info = modelInfo(type);
  const out: Record<string, FieldInfo> = {};
  for (const [name, field] of Object.entries(info.fields)) {
    if (!SYSTEM_FIELDS.has(name) && !field.isUpdatedAt) out[name] = field;
  }
  // A shared record's public mark lives on its `entities` row (item 47).
  if (info.entityKind && !("isPublic" in out)) out.isPublic = { type: "Boolean", required: true, list: false, hasDefault: true };
  return out;
}

const fieldsCache = new Map<string, z.ZodType>();

function fieldsSchema(type: string, op: "create" | "update", placed = false): z.ZodType {
  const key = `${type}:${op}:${placed}`;
  const cached = fieldsCache.get(key);
  if (cached) return cached;
  const shape: Record<string, z.ZodType> = {};
  for (const [name, field] of Object.entries(editableFields(type))) {
    const schema = fieldSchema(name, field, op === "create");
    // A placed segment takes its set and sort key from the segment it goes next to.
    shape[name] = op === "update" || (placed && (name === "setId" || name === "sortKey")) ? schema.optional() : schema;
  }
  const schema = z.object(shape).strict();
  fieldsCache.set(key, schema);
  return schema;
}

const editShape = {
  type: z.string().min(1).max(60),
  ref: z.string().min(1).max(60).optional(),
  fields: z.record(z.string(), z.unknown()),
};

const neighbourSchema = z.union([z.number().int().positive(), refSchema]);

const editSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("create"), ...editShape, before: neighbourSchema.optional(), after: neighbourSchema.optional() }).strict(),
  z.object({
    op: z.literal("update"),
    ...editShape,
    id: z.number().int().positive(),
    rev: z.number().int().positive(),
  }).strict(),
]);

export const editsSchema = z.array(z.unknown()).min(1, "Send at least one edit.").max(MAX_EDITS * 2, "Far too many edits in one call.");

function addIssues(fields: Record<string, string[]>, prefix: string, error: z.ZodError): void {
  for (const issue of error.issues) {
    const path = [prefix, ...issue.path].join(".");
    (fields[path] ??= []).push(issue.message);
  }
}

/**
 * Check a list of edits. Throws `invalid_input` with one entry per problem, keyed by the edit
 * and the field (`edits.0.fields.title`). It does not check the database; the caller checks the
 * records exist and the versions match.
 */
export function parseEdits(input: unknown): ParsedEdit[] {
  const list = editsSchema.safeParse(input);
  const problems: Record<string, string[]> = {};
  if (!list.success) {
    addIssues(problems, "edits", list.error);
    throw new AppError("invalid_input", undefined, problems);
  }
  const parsed: ParsedEdit[] = [];
  const created = new Map<string, string>();
  const updated = new Set<string>();
  list.data.forEach((raw, index) => {
    const prefix = `edits.${index}`;
    const edit = editSchema.safeParse(raw);
    if (!edit.success) return addIssues(problems, prefix, edit.error);
    const { op, type } = edit.data;
    const refusal = writeRefusal(type);
    if (refusal) return void (problems[`${prefix}.type`] = [refusal]);
    if (op === "update" && !isUpdatable(type)) {
      return void (problems[`${prefix}.type`] = [`A ${type} record cannot be changed after it is created.`]);
    }
    const problemCount = Object.keys(problems).length;
    const placement = edit.data.op === "create" ? placementOf(edit.data, type, `${prefix}`, created, problems) : undefined;
    // A before/after error comes first: do not add errors about setId or sortKey as well.
    if (Object.keys(problems).length > problemCount) return;
    const fields = fieldsSchema(type, op, placement !== undefined).safeParse(edit.data.fields);
    if (!fields.success) return addIssues(problems, `${prefix}.fields`, fields.error);
    const values = fields.data as Record<string, FieldValue>;
    if (placement && "sortKey" in values) problems[`${prefix}.fields.sortKey`] = ["Use before or after, or sortKey, not both."];
    if (op === "update" && Object.keys(values).length === 0) {
      return void (problems[`${prefix}.fields`] = ["Name at least one field to change."]);
    }
    checkRefs(values, type, created, `${prefix}.fields`, problems);
    if (edit.data.op === "update") {
      const key = `${type}:${edit.data.id}`;
      if (updated.has(key)) problems[`${prefix}.id`] = [`${type} ${edit.data.id} is changed twice in one call. Merge the two edits.`];
      updated.add(key);
    }
    if (edit.data.ref !== undefined) {
      if (op !== "create") problems[`${prefix}.ref`] = ["Only a new record has a ref."];
      else if (created.has(edit.data.ref)) problems[`${prefix}.ref`] = ["This ref is used twice."];
      else created.set(edit.data.ref, type);
    }
    parsed.push({ op, type, ref: edit.data.ref, ...(placement ? { placement } : {}), id: edit.data.op === "update" ? edit.data.id : undefined, rev: edit.data.op === "update" ? edit.data.rev : undefined, fields: values });
  });
  if (Object.keys(problems).length > 0) throw new AppError("invalid_input", undefined, problems);
  return parsed;
}

/** Read `before` or `after` of a new segment. Reports a misuse in `problems`. */
function placementOf(
  edit: { before?: number | RefValue; after?: number | RefValue },
  type: string,
  prefix: string,
  created: Map<string, string>,
  problems: Record<string, string[]>,
): ParsedEdit["placement"] {
  const { before, after } = edit;
  if (before === undefined && after === undefined) return undefined;
  if (type !== "Segment") return void (problems[`${prefix}.type`] = ["Only a new Segment can use before or after."]);
  if (before !== undefined && after !== undefined) return void (problems[`${prefix}.before`] = ["Use before or after, not both."]);
  const side = before !== undefined ? "before" : "after";
  const target = (before ?? after) as number | RefValue;
  if (typeof target === "object" && created.get(target.ref) !== "Segment") {
    problems[`${prefix}.${side}`] = [`No earlier new Segment has the ref "${target.ref}".`];
  }
  return { side, target };
}

function checkRefs(
  values: Record<string, FieldValue>,
  type: string,
  created: Map<string, string>,
  prefix: string,
  problems: Record<string, string[]>,
): void {
  for (const [name, value] of Object.entries(values)) {
    if (value === null || typeof value !== "object" || value instanceof Date) continue;
    const target = modelInfo(type).fields[name]?.fk;
    const kind = created.get(value.ref);
    if (kind === undefined) problems[`${prefix}.${name}`] = [`No earlier new record has the ref "${value.ref}".`];
    else if (kind !== target) problems[`${prefix}.${name}`] = [`The ref "${value.ref}" is a ${kind}, not a ${target}.`];
  }
}

export const evidenceSchema = z
  .object({
    sourceId: z.number().int().positive().optional(),
    recordingId: z.number().int().positive().optional(),
    contributorId: z.number().int().positive().optional(),
    place: z.string().max(500).optional(),
    ownKnowledge: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const named = [value.sourceId, value.recordingId, value.contributorId].filter((v) => v !== undefined).length;
    if (value.ownKnowledge && named > 0) {
      ctx.addIssue({ code: "custom", message: "Name a source, a recording or a contributor, or own knowledge, not both." });
    } else if (!value.ownKnowledge && named === 0) {
      ctx.addIssue({ code: "custom", message: "Name a source, a recording or a contributor, or set ownKnowledge." });
    }
  });

export type Evidence = z.infer<typeof evidenceSchema>;

export function parseEvidence(input: unknown): Evidence {
  const result = evidenceSchema.safeParse(input);
  if (result.success) return result.data;
  const problems: Record<string, string[]> = {};
  addIssues(problems, "evidence", result.error);
  throw new AppError("invalid_input", undefined, problems);
}

export function knownTypeNames(): string[] {
  return Object.keys(MODEL.models);
}
