import { getPrisma } from "@/lib/db";
import { describeRecord, withType, type Row } from "@/lib/changes/labels";
import { MODEL } from "@/lib/content-access";

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
  items: Array<{ position: number; tableName: string; label: string; recordId: number; action: string; before: Row | null; after: Row | null }>;
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
      source: { select: { title: true } },
      contributor: { select: { name: true } },
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
  return rows.map((row) => {
    const parts: string[] = [];
    if (row.ownKnowledge) parts.push("own knowledge");
    if (row.source) parts.push(`source "${row.source.title}"`);
    if (row.recordingId !== null) parts.push(`recording #${row.recordingId}`);
    if (row.contributor) parts.push(`contributor ${row.contributor.name}`);
    if (row.place) parts.push(`at ${row.place}`);
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
      evidence: parts.join(", ") || "none",
      items: row.items.map((item) => ({
        position: item.position,
        tableName: item.tableName,
        label: labelOf(item),
        recordId: item.recordId,
        action: item.action,
        before: item.before as Row | null,
        after: item.after as Row | null,
      })),
    };
  });
}
