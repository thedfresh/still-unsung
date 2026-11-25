import { randomBytes } from "node:crypto";
import { Prisma } from "@/generated/prisma/client";
import { defaultPublicMark, modelInfo } from "@/lib/content-access";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { PreviewData, PreviewItem } from "@/lib/changes/preview-format";
import { hashToken } from "@/lib/tokens";
import { MAX_EDITS, parseEdits, parseEvidence, type Evidence, type ParsedEdit } from "@/lib/validation/content";
import { labelRow, readRow, type Tx } from "@/lib/data/changes/rows";
import { findConflicts, findMissingListValues, writeCitations, writeEdits, type AppliedItem } from "@/lib/data/changes/write-edits";

/** A preview token works once and for 30 minutes. */
export const PREVIEW_MINUTES = 30;
const MAX_LIVE_PREVIEWS = 20;

/** Thrown at the end of a preview to roll back everything the trial run wrote. */
class Rollback extends Error {
  constructor(readonly data: { items: PreviewItem[]; citedLabels: string[] }) {
    super("rollback");
  }
}

export interface PreviewInput {
  evidence: unknown;
  edits: unknown;
  isPublic?: boolean;
}

export interface PreviewResult extends PreviewData {
  changesetId: number | null;
}

async function describeItems(tx: Tx, items: AppliedItem[], citations: AppliedItem[]) {
  const labels = new Map<string, string>();
  const nameOf = async (type: string, id: number, row: AppliedItem["after"] | null): Promise<string> => {
    const key = `${type}:${id}`;
    const known = labels.get(key);
    if (known) return known;
    const found = row ?? (await readRow(tx, type, id));
    const label = found ? await labelRow(tx, type, found) : `${type} #${id}`;
    labels.set(key, label);
    return label;
  };
  const described: PreviewItem[] = [];
  for (const item of items) {
    const label = await nameOf(item.type, item.id, item.after);
    const attachesTo: string[] = [];
    if (item.op === "create") {
      for (const [name, field] of Object.entries(modelInfo(item.type).fields)) {
        const value = item.after[name];
        if (field.fk && field.fk !== "Entity" && typeof value === "number") attachesTo.push(await nameOf(field.fk, value, null));
      }
    }
    described.push({ op: item.op, type: item.type, label, before: item.before, after: item.after, attachesTo });
  }
  const cited = new Set(citations.map((c) => c.after.entityId));
  const citedLabels = [];
  for (const item of items) if (cited.has(item.id)) citedLabels.push(labels.get(`${item.type}:${item.id}`) as string);
  return { items: described, citedLabels };
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

function summarize(items: PreviewItem[]): string {
  const created = items.filter((i) => i.op === "create").length;
  const changed = items.length - created;
  return `Agent edit: ${created} new, ${changed} changed. ${items.map((i) => i.label).slice(0, 3).join("; ")}`.slice(0, 500);
}

async function trialRun(tx: Tx, edits: ParsedEdit[]): Promise<PreviewData["warnings"]> {
  const warnings = await findMissingListValues(tx, edits);
  for (const c of await findConflicts(tx, edits)) {
    warnings.push(
      c.current
        ? `Edit ${c.index}: ${c.type} ${c.id} changed since you read it (you read version ${c.expectedRev}, it is now version ${String(c.current.rev)}). Read it again.`
        : `Edit ${c.index}: ${c.type} ${c.id} does not exist.`,
    );
  }
  return warnings;
}

/**
 * Check a list of edits and show what they would do, without keeping anything. The edits run for
 * real inside a transaction that is rolled back, so the database checks them too. When nothing
 * blocks it, the preview is saved as a changeset with a one-time token.
 */
export async function previewChanges(userId: string, input: PreviewInput): Promise<PreviewResult> {
  const edits = parseEdits(input.edits);
  const evidence = parseEvidence(input.evidence);
  const isPublic = input.isPublic ?? defaultPublicMark(edits.map((e) => e.type));
  const base = { items: [], citedLabels: [], isPublic, expiresAt: null, token: null, changesetId: null };
  const db = getPrisma();
  const live = await db.changeset.count({ where: { userId, previewToken: { not: null }, previewExpiresAt: { gt: new Date() } } });
  if (live >= MAX_LIVE_PREVIEWS) throw new AppError("rate_limited", "Too many open previews. Apply one or wait for them to expire.");
  let evidenceText = "";
  let warnings: string[] = [];
  if (edits.length > MAX_EDITS) {
    return { ...base, evidence: "", warnings: [`The call has ${edits.length} edits. The limit is ${MAX_EDITS}. Split it into smaller calls.`] };
  }
  let data: Rollback["data"] | null = null;
  try {
    await db.$transaction(async (tx) => {
      evidenceText = await describeEvidence(tx, evidence);
      warnings = await trialRun(tx, edits);
      if (warnings.length > 0) return;
      const items = await writeEdits(tx, edits);
      const citations = await writeCitations(tx, items, evidence, items.length);
      throw new Rollback(await describeItems(tx, items, citations));
    });
  } catch (err) {
    if (!(err instanceof Rollback)) throw err;
    data = err.data;
  }
  if (!data) return { ...base, evidence: evidenceText, warnings };
  const token = `suprev_${randomBytes(24).toString("base64url")}`;
  const expiresAt = new Date(Date.now() + PREVIEW_MINUTES * 60_000);
  const changeset = await db.changeset.create({
    data: {
      userId,
      path: "MCP",
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
  return { ...base, items: data.items, citedLabels: data.citedLabels, evidence: evidenceText, warnings: [], expiresAt, token, changesetId: changeset.id };
}
