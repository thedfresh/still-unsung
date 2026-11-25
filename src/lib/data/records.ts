import { isReadable, modelInfo } from "@/lib/content-access";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { Row } from "@/lib/changes/labels";
import { describeChangeEvidence, EVIDENCE_INCLUDE } from "@/lib/data/changes/list";
import { delegateOf, labelRow, toJson } from "@/lib/data/changes/rows";

const NAME_FIELDS = ["name", "title", "displayName", "label", "slug", "value", "body"];
const MAX_RESULTS = 25;

function assertReadable(type: string): void {
  if (!isReadable(type)) throw new AppError("invalid_input", undefined, { type: [`${type} is not a record type you can read.`] });
}

/**
 * The sets of a show in order, and the segments of each set in order. A segment carries its
 * work title, so the agent can read the setlist. Nested segments come after their parent.
 */
async function readSetlist(showId: number): Promise<Row[]> {
  const db = getPrisma();
  const sets = await db.set.findMany({
    where: { showId },
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { segments: { orderBy: [{ sortKey: "asc" }, { id: "asc" }], include: { work: { select: { title: true } } } } },
  });
  return sets.map(({ segments, ...set }) => ({
    ...set,
    segments: segments.map(({ work, ...segment }) => ({ ...segment, workTitle: work?.title ?? null })),
  }));
}

/** The most changesets "where this came from" lists for one record. */
const MAX_PROVENANCE = 20;

/**
 * The evidence of the applied changesets that created or changed a record, newest first. Changeset
 * items hold the table name and record ID as plain values, so this is a lookup by both.
 */
async function readProvenance(type: string, id: number): Promise<Row[]> {
  const items = await getPrisma().changesetItem.findMany({
    where: { tableName: modelInfo(type).table, recordId: id, changeset: { status: "APPLIED" } },
    orderBy: { changeset: { appliedAt: "desc" } },
    take: MAX_PROVENANCE,
    select: {
      action: true,
      changeset: { include: { user: { select: { email: true } }, ...EVIDENCE_INCLUDE } },
    },
  });
  return items.map(({ action, changeset }) => ({
    changesetId: changeset.id,
    date: changeset.appliedAt?.toISOString() ?? null,
    user: changeset.user.email,
    action: action === "CREATE" ? "created" : "changed",
    evidence: describeChangeEvidence(changeset),
  }));
}

/**
 * One record by ID or by legacy ID, with everything the agent may edit: private fields too. A
 * shared record comes with its citations, notes and external IDs. Every record comes with
 * the evidence of the changes that made and changed it (`whereThisCameFrom`, data-model item 109).
 */
export async function getRecord(type: string, key: { id?: number; legacyId?: string }): Promise<Row> {
  assertReadable(type);
  const info = modelInfo(type);
  const where: Record<string, unknown> = {};
  if (key.id !== undefined) where.id = key.id;
  else if (key.legacyId !== undefined && "legacyId" in info.fields) where.legacyId = key.legacyId;
  else throw new AppError("invalid_input", undefined, { id: ["Give an id, or a legacyId for a type that has one."] });
  const include = info.entityKind
    ? {
        entity: {
          include: {
            citations: true,
            notes: { include: { note: true } },
            externalIds: true,
          },
        },
      }
    : undefined;
  const db = getPrisma();
  const row = await delegateOf(db, type).findFirst({ where, ...(include ? { include } : {}) });
  if (!row) throw new AppError("not_found");
  const { entity, ...rest } = row as Row & { entity?: Row & { isPublic: boolean } };
  const whereThisCameFrom = await readProvenance(type, row.id as number);
  if (!entity) return toJson({ ...rest, whereThisCameFrom });
  const sets = type === "Show" ? await readSetlist(row.id as number) : undefined;
  const { citations, notes, externalIds, isPublic } = entity as Row & { isPublic: boolean };
  return toJson({ ...rest, isPublic, ...(sets ? { sets } : {}), attachments: { citations, notes, externalIds }, whereThisCameFrom });
}

export interface SearchInput {
  type: string;
  query?: string;
  /** For a show: `1978`, `1978-05` or `1978-05-23`. */
  date?: string;
  /** For a show: part of a place name. */
  place?: string;
  limit?: number;
}

export interface SearchHit {
  id: number | null;
  rev: number | null;
  label: string;
  legacyId: string | null;
}

async function placeIds(text: string): Promise<number[]> {
  const db = getPrisma();
  const byName = await db.placeName.findMany({ where: { name: { contains: text, mode: "insensitive" } }, select: { placeId: true }, take: 200 });
  const bySlug = await db.place.findMany({ where: { slug: { contains: text, mode: "insensitive" } }, select: { id: true }, take: 200 });
  return [...new Set([...byName.map((p) => p.placeId), ...bySlug.map((p) => p.id)])];
}

async function buildWhere(input: SearchInput): Promise<Record<string, unknown>> {
  const info = modelInfo(input.type);
  const and: Record<string, unknown>[] = [];
  if (input.query) {
    const text = input.query;
    const or: Record<string, unknown>[] = Object.keys(info.fields)
      .filter((name) => NAME_FIELDS.includes(name) && info.fields[name].type === "String")
      .map((name) => ({ [name]: { contains: text, mode: "insensitive" } }));
    if (input.type === "Place") or.push({ id: { in: await placeIds(text) } });
    if (or.length === 0) throw new AppError("invalid_input", undefined, { query: [`${input.type} has no name or title to search.`] });
    and.push({ OR: or });
  }
  if (input.date) {
    const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(input.date);
    if (!match || input.type !== "Show") throw new AppError("invalid_input", undefined, { date: ["Use a date like 1978, 1978-05 or 1978-05-23, with type Show."] });
    and.push({ dateYear: Number(match[1]), ...(match[2] ? { dateMonth: Number(match[2]) } : {}), ...(match[3] ? { dateDay: Number(match[3]) } : {}) });
  }
  if (input.place) {
    if (input.type !== "Show") throw new AppError("invalid_input", undefined, { place: ["The place filter works with type Show."] });
    and.push({ placeId: { in: await placeIds(input.place) } });
  }
  return and.length > 0 ? { AND: and } : {};
}

/** Find records by name, title, date or place. It returns short hits; read one for the detail. */
export async function searchRecords(input: SearchInput): Promise<SearchHit[]> {
  assertReadable(input.type);
  if (!input.query && !input.date && !input.place) {
    throw new AppError("invalid_input", undefined, { query: ["Give a query, a date or a place."] });
  }
  const db = getPrisma();
  const rows = await delegateOf(db, input.type).findMany({
    where: await buildWhere(input),
    orderBy: { id: "asc" },
    take: Math.min(Math.max(input.limit ?? 10, 1), MAX_RESULTS),
  });
  const hits: SearchHit[] = [];
  for (const row of rows) {
    hits.push({
      id: typeof row.id === "number" ? row.id : null,
      rev: typeof row.rev === "number" ? row.rev : null,
      label: await labelRow(db, input.type, toJson(row)),
      legacyId: typeof row.legacyId === "string" ? row.legacyId : null,
    });
  }
  return hits;
}
