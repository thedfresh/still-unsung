import { getPrisma } from "@/lib/db";
import { describeRecord, withType, type Row } from "@/lib/changes/labels";
import { MODEL } from "@/lib/content-access";
import { buildReadout, renderReadout, storedReadoutItem, type ItemDetail, type Readout } from "@/lib/changes/readout";
import { lookUpNames } from "@/lib/data/changes/earlier";

export interface ChangesetRow {
  id: number;
  path: string;
  status: string;
  isPublic: boolean;
  summary: string;
  createdAt: Date;
  appliedAt: Date | null;
  /** Who made the change. */
  userEmail: string | null;
  userRole: string;
  /** The evidence, in words. */
  evidence: string;
  /** The counts sentence, for example "Added 2 segments to 1 show." */
  counts: string;
  /** The readout: counts, unusual lines, and the records grouped by parent. */
  readout: string;
  /** The same readout as a structure, for the page to draw as cards. */
  readoutData: Readout;
  items: Array<{ position: number; tableName: string; label: string; recordId: number; action: string; before: Row | null; after: Row | null }>;
}

interface EvidenceFields {
  ownKnowledge: boolean;
  source: { title: string } | null;
  recordingId: number | null;
  contributor: { name: string } | null;
  place: string | null;
}

/** The fields a query needs to name a changeset's evidence in words. */
export const EVIDENCE_INCLUDE = { source: { select: { title: true } }, contributor: { select: { name: true } } } as const;

/** The evidence of a changeset, in words. */
export function describeChangeEvidence(row: EvidenceFields): string {
  const parts: string[] = [];
  if (row.ownKnowledge) parts.push("own knowledge");
  if (row.source) parts.push(`source "${row.source.title}"`);
  if (row.recordingId !== null) parts.push(`recording #${row.recordingId}`);
  if (row.contributor) parts.push(`contributor ${row.contributor.name}`);
  if (row.place) parts.push(`at ${row.place}`);
  return parts.join(", ") || "none";
}

export const CHANGES_PAGE_SIZE = 50;

/**
 * One page of applied changesets, newest first, with who made each one, their evidence, every
 * stored change and the readout of those changes (the same text as the preview). A page past
 * the end gives the last page; `page` is the page that this call returns.
 */
export async function listChangesets(
  requestedPage = 1,
  pageSize = CHANGES_PAGE_SIZE,
): Promise<{ changes: ChangesetRow[]; total: number; page: number }> {
  // Applied changes only: unapplied previews must not push the log off the page.
  const where = { status: "APPLIED" as const };
  const total = await getPrisma().changeset.count({ where });
  const page = Math.min(Math.max(requestedPage, 1), Math.max(1, Math.ceil(total / pageSize)));
  const rows = await getPrisma().changeset.findMany({
    where,
    orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
    skip: (page - 1) * pageSize,
    take: pageSize,
    include: {
      user: { select: { email: true, role: true } },
      ...EVIDENCE_INCLUDE,
      items: { orderBy: { position: "asc" } },
    },
  });
  const typeOfTable = (table: string) => Object.keys(MODEL.models).find((type) => MODEL.models[type].table === table) ?? table;
  // An item stored before the apply step saved its names has only IDs. Look the names up for
  // the whole page at once: one query per type.
  const old = rows.flatMap((row) => row.items.filter((item) => !item.detail));
  const names = await lookUpNames(old.map((item) => ({ type: typeOfTable(item.tableName), recordId: item.recordId, before: item.before as Row | null, after: item.after as Row | null })));
  const namesOf = new Map(old.map((item, index) => [item, names[index]]));
  /**
   * The name the record had when it changed, stored at apply time. An older item gets the name
   * of the record as it is now, or a name made from its stored state.
   */
  const labelOf = (item: (typeof rows)[number]["items"][number]): string => {
    if (item.label) return item.label;
    const type = typeOfTable(item.tableName);
    const found = namesOf.get(item)?.label;
    if (found) return withType(type, found);
    const state = (item.after ?? item.before) as Row | null;
    return state ? withType(type, describeRecord(type, state)) : `${item.tableName} #${item.recordId}`;
  };
  const changes = rows.map((row) => {
    const items = row.items.map((item) => ({
      position: item.position,
      tableName: item.tableName,
      label: labelOf(item),
      recordId: item.recordId,
      action: item.action,
      before: item.before as Row | null,
      after: item.after as Row | null,
    }));
    const readoutItems = row.items.map((item, index) => {
      const found = namesOf.get(item);
      const detail = item.detail ? (item.detail as unknown as ItemDetail) : found ? { links: found.links, parent: null } : null;
      return storedReadoutItem({ ...items[index], type: typeOfTable(item.tableName), detail });
    });
    const readout = buildReadout(readoutItems);
    return {
      id: row.id,
      path: row.path,
      status: row.status,
      isPublic: row.isPublic,
      summary: row.summary,
      createdAt: row.createdAt,
      appliedAt: row.appliedAt,
      userEmail: row.user.email,
      userRole: row.user.role,
      evidence: describeChangeEvidence(row),
      counts: readout.counts,
      readout: renderReadout(readout),
      readoutData: readout,
      items,
    };
  });
  return { changes, total, page };
}
