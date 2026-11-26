import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { defaultPublicMark } from "@/lib/content-access";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { withType } from "@/lib/changes/labels";
import type { PreviewData, PreviewItem } from "@/lib/changes/preview-format";
import { countsSentence } from "@/lib/changes/readout";
import { hashToken } from "@/lib/tokens";
import { MAX_EDITS, parseEdits, parseEvidence, type Evidence, type ParsedEdit } from "@/lib/validation/content";
import { describeItems } from "@/lib/data/changes/describe";
import type { Tx } from "@/lib/data/changes/rows";
import { findRulesPageRefusals, touchesRulesPage } from "@/lib/data/changes/rules-page";
import { findConflicts, findMissingListValues, writeEdits } from "@/lib/data/changes/write-edits";

/** A preview token works once and for 30 minutes. */
export const PREVIEW_MINUTES = 30;
const MAX_LIVE_PREVIEWS = 20;

/** Thrown at the end of a preview to roll back everything the trial run wrote. */
class Rollback extends Error {
  constructor(readonly data: { items: PreviewItem[] }) {
    super("rollback");
  }
}

export interface PreviewInput {
  evidence: unknown;
  edits: unknown;
  isPublic?: boolean;
  /** Who is saving: the MCP server (the default) or the admin screens. */
  path?: "MCP" | "ADMIN";
}

/** A record that changed since it was read, with its stored values, for a form to show. */
export interface PreviewConflict {
  record: string;
  expectedRev: number;
  /** The stored record now; null when it no longer exists. */
  current: Record<string, unknown> | null;
  /** The fields the edit wanted to write. */
  proposed: Record<string, unknown>;
}

export interface PreviewResult extends PreviewData {
  changesetId: number | null;
  conflicts: PreviewConflict[];
}

/** The place in a source, a recording or a contributor, in words, for the preview. */
async function describeEvidence(tx: Tx, evidence: Evidence): Promise<string> {
  if (evidence.ownKnowledge) return "the curator's own knowledge";
  const parts: string[] = [];
  if (evidence.sourceId !== undefined) {
    const source = await tx.source.findUnique({ where: { id: evidence.sourceId }, select: { title: true } });
    if (!source) throw new AppError("invalid_input", undefined, { "evidence.sourceId": ["No such source."] });
    parts.push(`source "${source.title}"`);
  }
  if (evidence.recordingId !== undefined) {
    const recording = await tx.recording.findUnique({ where: { id: evidence.recordingId }, select: { id: true } });
    if (!recording) throw new AppError("invalid_input", undefined, { "evidence.recordingId": ["No such recording."] });
    parts.push(`recording #${evidence.recordingId}`);
  }
  if (evidence.contributorId !== undefined) {
    const person = await tx.person.findUnique({ where: { id: evidence.contributorId }, select: { name: true } });
    if (!person) throw new AppError("invalid_input", undefined, { "evidence.contributorId": ["No such person."] });
    parts.push(`contributor ${person.name}`);
  }
  return parts.join(", ") + (evidence.place ? ` (${evidence.place})` : "");
}

/** The stored summary of a change: the counts sentence, then the first records. */
function summarize(items: PreviewItem[]): string {
  const names = items.map((i) => withType(i.type, i.label)).slice(0, 3).join("; ");
  return `${countsSentence(items)} ${names}`.slice(0, 500);
}

/**
 * The counts sentence at the start of a stored summary. A counts sentence has no full stop
 * inside it, so the first full stop ends it.
 */
export function countsOfSummary(summary: string): string {
  const end = summary.indexOf(".");
  return end === -1 ? summary : summary.slice(0, end + 1);
}

export async function trialRun(tx: Tx, edits: ParsedEdit[]): Promise<{ warnings: PreviewData["warnings"]; conflicts: PreviewConflict[] }> {
  const warnings = [...(await findRulesPageRefusals(tx, edits)), ...(await findMissingListValues(tx, edits))];
  const conflicts: PreviewConflict[] = [];
  for (const c of await findConflicts(tx, edits)) {
    conflicts.push({ record: `${c.type} ${c.id}`, expectedRev: c.expectedRev, current: c.current, proposed: c.proposed });
    warnings.push(
      c.current
        ? `Edit ${c.index}: ${c.type} ${c.id} changed since you read it (you read version ${c.expectedRev}, it is now version ${String(c.current.rev)}). Read it again.`
        : `Edit ${c.index}: ${c.type} ${c.id} does not exist.`,
    );
  }
  return { warnings, conflicts };
}

/**
 * Check a list of edits and show what they would do, without keeping anything. The edits run for
 * real inside a transaction that is rolled back, so the database checks them too. When nothing
 * blocks it, the preview is saved as a changeset with a one-time token.
 */
export async function previewChanges(userId: string, input: PreviewInput): Promise<PreviewResult> {
  const edits = parseEdits(input.edits);
  const evidence = parseEvidence(input.evidence);
  const db = getPrisma();
  // A change to the import rules page is always private, whatever the caller passes.
  const isPublic = (await touchesRulesPage(db, edits)) ? false : (input.isPublic ?? defaultPublicMark(edits.map((e) => e.type)));
  const base = { items: [], isPublic, expiresAt: null, token: null, changesetId: null, conflicts: [] as PreviewConflict[] };
  const live = await db.changeset.count({ where: { userId, previewToken: { not: null }, previewExpiresAt: { gt: new Date() } } });
  if (live >= MAX_LIVE_PREVIEWS) throw new AppError("rate_limited", "Too many open previews. Apply one or wait for them to expire.");
  let evidenceText = "";
  let warnings: string[] = [];
  let conflicts: PreviewConflict[] = [];
  if (edits.length > MAX_EDITS) {
    return { ...base, evidence: "", warnings: [`The call has ${edits.length} edits. The limit is ${MAX_EDITS}. Split it into smaller calls.`] };
  }
  let data: Rollback["data"] | null = null;
  try {
    await db.$transaction(async (tx) => {
      evidenceText = await describeEvidence(tx, evidence);
      ({ warnings, conflicts } = await trialRun(tx, edits));
      if (warnings.length > 0) return;
      const items = await writeEdits(tx, edits);
      throw new Rollback({ items: await describeItems(tx, items) });
    }, { timeout: 30_000 }); // the trial run and the descriptions run many small queries: allow 30 seconds, not 5
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
    data = err.data;
  }
  if (!data) return { ...base, evidence: evidenceText, warnings, conflicts };
  const token = `suprev_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + PREVIEW_MINUTES * 60_000);
  const changeset = await db.changeset.create({
    data: {
      userId,
      path: input.path ?? "MCP",
      status: "PREVIEWED",
      sourceId: evidence.sourceId,
      recordingId: evidence.recordingId,
      contributorId: evidence.contributorId,
      place: evidence.place,
      ownKnowledge: evidence.ownKnowledge ?? false,
      isPublic,
      summary: summarize(data.items),
      previewToken: hashToken(token),
      plan: input.edits as Prisma.InputJsonValue,
      previewExpiresAt: expiresAt,
    },
    select: { id: true },
  });
  return { ...base, items: data.items, evidence: evidenceText, warnings: [], expiresAt, token, changesetId: changeset.id };
}
