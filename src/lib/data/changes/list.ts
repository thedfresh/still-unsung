import { getPrisma } from "@/lib/db";
import type { Row } from "@/lib/changes/labels";

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
  items: Array<{ position: number; tableName: string; recordId: number; action: string; before: Row | null; after: Row | null }>;
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

/** The latest changesets with who made each one, their evidence and every stored change. */
export async function listChangesets(limit = 50): Promise<ChangesetRow[]> {
  const rows = await getPrisma().changeset.findMany({
    // Applied changes only: unapplied previews must not push the audit trail off the page.
    where: { status: "APPLIED" },
    orderBy: { appliedAt: "desc" },
    take: limit,
    include: {
      user: { select: { email: true, role: true } },
      ...EVIDENCE_INCLUDE,
      items: { orderBy: { position: "asc" } },
    },
  });
  return rows.map((row) => {
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
      items: row.items.map((item) => ({
        position: item.position,
        tableName: item.tableName,
        recordId: item.recordId,
        action: item.action,
        before: item.before as Row | null,
        after: item.after as Row | null,
      })),
    };
  });
}
