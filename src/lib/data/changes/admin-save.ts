import type { Evidence } from "@/lib/validation/content";
import { showValue } from "@/lib/changes/labels";
import { applyChanges } from "@/lib/data/changes/apply";
import { previewChanges, type PreviewConflict } from "@/lib/data/changes/preview";
import { describeChangeEvidence, EVIDENCE_INCLUDE } from "@/lib/data/changes/list";
import { getPrisma } from "@/lib/db";
import type { CurrentUser, Role } from "@/lib/roles";

/** One record that moved on since the form read it, as words for the form. */
export interface SaveConflict {
  /** For example "Segment 12". */
  record: string;
  expectedRev: number;
  /** The stored version now; null when the record is gone. */
  currentRev: number | null;
  /** What the user tried to save, one line per field. */
  yours: Array<{ field: string; value: string }>;
  /** What is stored now, for the same fields. Empty when the record is gone. */
  stored: Array<{ field: string; value: string }>;
}

export type SaveResult =
  | { status: "saved"; changesetId: number }
  /** Nothing was written because a record changed. `messages` is plain text for the form. */
  | { status: "conflict"; messages: string[]; conflicts: SaveConflict[] }
  /** Nothing was written for another reason, for example a missing list value. */
  | { status: "blocked"; messages: string[] };

export interface SaveInput {
  /** Edits in the shape of the MCP tool: `{ op, type, ref?, id?, rev?, fields, before?, after? }`. */
  edits: unknown;
  evidence: unknown;
  isPublic?: boolean;
}

/** Loaded on first use, so database tests need no Next.js or Auth.js runtime. */
async function requireAdmin(roles: readonly Role[]): Promise<CurrentUser> {
  return (await import("@/lib/current-user")).requireUser(roles);
}

function words(values: Record<string, unknown>, fields: string[]): SaveConflict["yours"] {
  return fields.map((field) => ({ field, value: showValue(values[field]) }));
}

function describeConflict(c: PreviewConflict): SaveConflict {
  const fields = Object.keys(c.proposed);
  const currentRev = c.current && typeof c.current.rev === "number" ? c.current.rev : null;
  return {
    record: c.record,
    expectedRev: c.expectedRev,
    currentRev,
    yours: words(c.proposed, fields),
    stored: c.current ? words(c.current, fields) : [],
  };
}

function conflictMessage(c: SaveConflict): string {
  if (c.currentRev === null) return `${c.record} no longer exists. Nothing was saved.`;
  return `${c.record} changed since you opened it (you read version ${c.expectedRev}, it is now version ${c.currentRev}). Nothing was saved.`;
}

function conflictResult(list: PreviewConflict[]): SaveResult {
  const conflicts = list.map(describeConflict);
  return { status: "conflict", messages: conflicts.map(conflictMessage), conflicts };
}

/**
 * Save one admin edit: every edit screen calls this and nothing else. It runs the same preview
 * and apply code as the MCP server, in one step, with path ADMIN and the signed-in user. One
 * save is one changeset. Each update carries the `rev` the form read; a stale `rev` writes
 * nothing and returns both versions. A refusal comes back as plain messages, never as a
 * database error.
 */
export async function saveAdminChanges(
  input: SaveInput,
  /** Who may save. Tests pass a fixed user; the default reads the request. */
  getUser: (roles: readonly Role[]) => Promise<CurrentUser> = requireAdmin,
): Promise<SaveResult> {
  const user = await getUser(["ADMIN"]);
  const preview = await previewChanges(user.id, { ...input, path: "ADMIN" });
  if (preview.conflicts.length > 0) return conflictResult(preview.conflicts);
  if (!preview.token) return { status: "blocked", messages: preview.warnings.length > 0 ? preview.warnings : ["Nothing was saved."] };
  const result = await applyChanges(user.id, preview.token);
  if (result.ok) return { status: "saved", changesetId: result.changesetId };
  if (result.reason === "blocked") return { status: "blocked", messages: result.messages };
  return conflictResult(result.conflicts.map((c) => ({ record: c.record, expectedRev: c.expectedRev, current: c.current, proposed: c.proposed })));
}

export interface RecentEvidence {
  evidence: Evidence;
  /** The choice in words, for the button. */
  label: string;
}

/** The most recent distinct evidence choices of a user, newest first. "Own knowledge" is not listed. */
export async function recentEvidence(userId: string, limit = 5): Promise<RecentEvidence[]> {
  const rows = await getPrisma().changeset.findMany({
    where: { userId, path: "ADMIN", status: "APPLIED", ownKnowledge: false },
    orderBy: { id: "desc" },
    take: 50,
    include: EVIDENCE_INCLUDE,
  });
  const seen = new Set<string>();
  const out: RecentEvidence[] = [];
  for (const row of rows) {
    const evidence: Evidence = {
      ...(row.sourceId !== null ? { sourceId: row.sourceId } : {}),
      ...(row.recordingId !== null ? { recordingId: row.recordingId } : {}),
      ...(row.contributorId !== null ? { contributorId: row.contributorId } : {}),
      ...(row.place ? { place: row.place } : {}),
    };
    const key = JSON.stringify(evidence);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ evidence, label: describeChangeEvidence(row) });
    if (out.length === limit) break;
  }
  return out;
}
