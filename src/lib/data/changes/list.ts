import { getPrisma } from "@/lib/db";
import { describeRecord, withType, type Row } from "@/lib/changes/labels";
import { MODEL } from "@/lib/content-access";
import { countsSentence, formatReadout, storedReadoutItem, type ItemDetail } from "@/lib/changes/readout";

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

export const CHANGES_PAGE_SIZE = 20;

/**
 * One page of applied changesets, newest first, with who made each one, their evidence, every
 * stored change and the readout of those changes (the same text as the preview).
 */
export async function listChangesets(page = 1, pageSize = CHANGES_PAGE_SIZE): Promise<{ changes: ChangesetRow[]; total: number }> {
  // Applied changes only: unapplied previews must not push the log off the page.
  const where = { status: "APPLIED" as const };
  const total = await getPrisma().changeset.count({ where });
  const rows = await getPrisma().changeset.findMany({
    where,
    orderBy: [{ appliedAt: "desc" }, { id: "desc" }],
    skip: (Math.max(page, 1) - 1) * pageSize,
    take: pageSize,
    include: {
      user: { select: { email: true, role: true } },
      ...EVIDENCE_INCLUDE,
      items: { orderBy: { position: "asc" } },
    },
  });
  const typeOfTable = (table: string) => Object.keys(MODEL.models).find((type) => MODEL.models[type].table === table);
  /**
   * The name the record had when it changed, stored at apply time. An item from before that
   * column falls back to a name made from its stored state, with no database query.
   */
  const labelOf = (item: (typeof rows)[number]["items"][number]): string => {
    if (item.label) return item.label;
    const type = typeOfTable(item.tableName);
    const state = (item.after ?? item.before) as Row | null;
    return type && state ? withType(type, describeRecord(type, state)) : `${item.tableName} #${item.recordId}`;
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
    const readoutItems = row.items.map((item, index) =>
      storedReadoutItem({ ...items[index], type: typeOfTable(item.tableName) ?? item.tableName, detail: item.detail as ItemDetail | null }),
    );
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
      counts: countsSentence(readoutItems),
      readout: formatReadout(readoutItems),
      items,
    };
  });
  return { changes, total };
}
