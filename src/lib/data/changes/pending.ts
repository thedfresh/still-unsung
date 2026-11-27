import { getPrisma } from "@/lib/db";
import type { Row } from "@/lib/changes/labels";
import type { PreviewItem } from "@/lib/changes/preview-format";
import { buildReadout, type Readout } from "@/lib/changes/readout";
import { modelInfo } from "@/lib/content-access";
import { parseEdits } from "@/lib/validation/content";
import { describeItems } from "@/lib/data/changes/describe";
import { countsOfSummary, trialRun } from "@/lib/data/changes/preview";
import { findShowLinks, type ShowLink } from "@/lib/data/changes/show-links";
import { CHANGES_PAGE_SIZE, describeChangeEvidence, EVIDENCE_INCLUDE } from "@/lib/data/changes/list";
import { ConflictAbort, writeEdits, type VersionConflict } from "@/lib/data/changes/write-edits";
import { AppError } from "@/lib/errors";

/** The most previews that the list shows. A user may hold at most 20 open previews at once. */
const LIST_LIMIT = 50;

/**
 * What a preview is now. `open`: it can still be applied. `expired`: its token ran out. `used`:
 * its token was claimed but the apply did not finish. `applied`: it was applied (and maybe undone).
 */
export type PendingState = "open" | "expired" | "used" | "applied";

export interface PendingPreview {
  id: number;
  state: PendingState;
  /** For an applied change: the page of the Changes log that lists it. Null otherwise. */
  appliedPage: number | null;
  userEmail: string | null;
  userRole: string;
  evidence: string;
  createdAt: Date;
  expiresAt: Date | null;
  /** The counts sentence stored with the preview, for example "Added 1 show." */
  counts: string;
  /** The proposed change as cards. Null unless the preview is open and still valid. */
  readout: Readout | null;
  /** Why an open preview cannot be applied now: a record changed, or a list value is missing. */
  warnings: string[];
}

/** Thrown at the end of the trial run to roll back everything it wrote. */
class Rollback extends Error {
  constructor(readonly items: PreviewItem[]) {
    super("rollback");
  }
}

export async function changesetExists(id: number): Promise<boolean> {
  return (await getPrisma().changeset.count({ where: { id } })) > 0;
}

/** The stored edits, run again as the preview ran them, in a transaction that always rolls back. */
async function rebuildItems(plan: unknown, path: "MCP" | "ADMIN"): Promise<{ items: PreviewItem[] | null; warnings: string[] }> {
  const edits = parseEdits(plan, path);
  try {
    return await getPrisma().$transaction(async (tx) => {
      const { warnings } = await trialRun(tx, edits);
      if (warnings.length > 0) return { items: null, warnings };
      throw new Rollback(await describeItems(tx, await writeEdits(tx, edits)));
    }, { timeout: 30_000 });
  } catch (err) {
    if (err instanceof Rollback) return { items: err.items, warnings: [] };
    // The records changed since the preview: the plan no longer fits. Say so on the page.
    if (err instanceof AppError) return { items: null, warnings: [err.message] };
    if (err instanceof ConflictAbort) return { items: null, warnings: err.conflicts.map(conflictMessage) };
    throw err;
  }
}

/** One plain line for a record that changed since the preview. */
function conflictMessage(c: VersionConflict): string {
  return c.current
    ? `Edit ${c.index}: ${c.type} ${c.id} changed since the preview (it was version ${c.expectedRev}, it is now version ${String(c.current.rev)}).`
    : `Edit ${c.index}: ${c.type} ${c.id} does not exist now.`;
}

/** Each item gets the show it sits in, when that show has a page, so its card can link to it. */
async function withShowIds(items: PreviewItem[]): Promise<PreviewItem[]> {
  const links = await findShowLinks(
    items.map((item, index) => ({
      changesetId: index,
      tableName: modelInfo(item.type).table,
      recordId: Number((item.after as Row).id),
      before: item.before,
      after: item.after,
    })),
  );
  return items.map((item, index) => ({ ...item, showId: (links.get(index) as ShowLink[] | undefined)?.[0]?.id ?? null }));
}

/** The page of the Changes log that holds an applied change: the log is newest first. */
async function pageOfApplied(row: { id: number; appliedAt: Date | null }): Promise<number> {
  if (!row.appliedAt) return 1;
  const newer = await getPrisma().changeset.count({
    where: {
      status: "APPLIED",
      OR: [{ appliedAt: { gt: row.appliedAt } }, { appliedAt: row.appliedAt, id: { gt: row.id } }],
    },
  });
  return Math.floor(newer / CHANGES_PAGE_SIZE) + 1;
}

/**
 * One preview, for its page. An open preview is rebuilt from the stored edits: the same trial run
 * as the preview, rolled back, then described. This never writes. Null when no such changeset exists.
 */
export async function getPendingPreview(id: number): Promise<PendingPreview | null> {
  const row = await getPrisma().changeset.findUnique({
    where: { id },
    include: { user: { select: { email: true, role: true } }, ...EVIDENCE_INCLUDE },
  });
  if (!row) return null;
  const now = Date.now();
  const state: PendingState =
    row.status !== "PREVIEWED"
      ? "applied"
      : !row.previewToken || row.plan === null
        ? "used"
        : !row.previewExpiresAt || row.previewExpiresAt.getTime() < now
          ? "expired"
          : "open";
  let readout: Readout | null = null;
  let warnings: string[] = [];
  if (state === "open") {
    const rebuilt = await rebuildItems(row.plan, row.path === "ADMIN" ? "ADMIN" : "MCP");
    warnings = rebuilt.warnings;
    if (rebuilt.items) readout = buildReadout(await withShowIds(rebuilt.items));
  }
  return {
    id: row.id,
    state,
    appliedPage: state === "applied" ? await pageOfApplied(row) : null,
    userEmail: row.user.email,
    userRole: row.user.role,
    evidence: describeChangeEvidence(row),
    createdAt: row.createdAt,
    expiresAt: row.previewExpiresAt,
    counts: readout?.counts ?? countsOfSummary(row.summary),
    readout,
    warnings,
  };
}

export interface PendingLine {
  id: number;
  counts: string;
  userEmail: string | null;
  evidence: string;
  createdAt: Date;
  expiresAt: Date;
}

/** The open previews, newest first: one line each. Nothing is rebuilt here; the counts are stored. */
export async function listPendingPreviews(): Promise<PendingLine[]> {
  const rows = await getPrisma().changeset.findMany({
    where: { status: "PREVIEWED", previewToken: { not: null }, previewExpiresAt: { gt: new Date() } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: LIST_LIMIT,
    include: { user: { select: { email: true } }, ...EVIDENCE_INCLUDE },
  });
  return rows.map((row) => ({
    id: row.id,
    counts: countsOfSummary(row.summary),
    userEmail: row.user.email,
    evidence: describeChangeEvidence(row),
    createdAt: row.createdAt,
    expiresAt: row.previewExpiresAt as Date,
  }));
}
