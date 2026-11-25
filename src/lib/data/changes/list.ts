import { getPrisma } from "@/lib/db";
import { withType, type Row } from "@/lib/changes/labels";
import { MODEL } from "@/lib/content-access";
import { labelRow } from "@/lib/data/changes/rows";

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
  const db = getPrisma();
  const typeOfTable = (table: string) => Object.keys(MODEL.models).find((type) => MODEL.models[type].table === table);
  /** The readable name of the record, from its stored state; the table and ID when that is not possible. */
  const labelOf = async (item: (typeof rows)[number]["items"][number]): Promise<string> => {
    const type = typeOfTable(item.tableName);
    const state = (item.after ?? item.before) as Row | null;
    return type && state ? withType(type, await labelRow(db, type, state)) : `${item.tableName} #${item.recordId}`;
  };
  return Promise.all(rows.map(async (row) => {
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
      items: await Promise.all(
        row.items.map(async (item) => ({
          position: item.position,
          tableName: item.tableName,
          label: await labelOf(item),
          recordId: item.recordId,
          action: item.action,
          before: item.before as Row | null,
          after: item.after as Row | null,
        })),
      ),
    };
  }));
}
