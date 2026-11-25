import { Prisma } from "@/generated/prisma/client";
import { modelInfo } from "@/lib/content-access";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hashToken } from "@/lib/tokens";
import { parseEdits } from "@/lib/validation/content";
import { withType, type Row } from "@/lib/changes/labels";
import { describeItems, itemDetail } from "@/lib/data/changes/describe";
import {
  ConflictAbort,
  findConflicts,
  findMissingListValues,
  writeEdits,
  type VersionConflict,
} from "@/lib/data/changes/write-edits";

export interface ConflictReport {
  index: number;
  record: string;
  expectedRev: number;
  /** The stored record now; null when it no longer exists. */
  current: Row | null;
  /** The fields the agent wanted to write. */
  proposed: Record<string, unknown>;
}

export type ApplyResult =
  | { ok: true; changesetId: number; applied: Array<{ op: string; record: string }> }
  | { ok: false; reason: "conflict"; conflicts: ConflictReport[] }
  | { ok: false; reason: "blocked"; messages: string[] };

const GONE = "This preview token is unknown, already used or expired. Make a new preview.";

/**
 * Claim a preview token. The claim is committed on its own, so a token works once even when the
 * apply then fails: a stale preview is dead and the agent makes a new one.
 */
async function claim(userId: string, token: string, isPublic: boolean | undefined) {
  const db = getPrisma();
  const hash = hashToken(token);
  const changeset = await db.changeset.findUnique({ where: { previewToken: hash } });
  const live = changeset && changeset.userId === userId && changeset.status === "PREVIEWED" && changeset.plan !== null;
  if (!live || !changeset.previewExpiresAt || changeset.previewExpiresAt.getTime() < Date.now()) throw new AppError("not_found", GONE);
  const claimed = await db.changeset.updateMany({
    where: { id: changeset.id, previewToken: hash, status: "PREVIEWED" },
    data: { previewToken: null, ...(isPublic === undefined ? {} : { isPublic }) },
  });
  if (claimed.count !== 1) throw new AppError("not_found", GONE);
  return changeset;
}

async function report(conflicts: VersionConflict[]): Promise<ConflictReport[]> {
  return conflicts.map((c) => ({ index: c.index, record: `${c.type} ${c.id}`, expectedRev: c.expectedRev, current: c.current, proposed: c.proposed }));
}

/**
 * Apply a previewed change by its token. Every version is checked again inside the write. If a
 * record changed since the preview, nothing is written and both versions are returned.
 */
export async function applyChanges(userId: string, token: string, isPublic?: boolean): Promise<ApplyResult> {
  const changeset = await claim(userId, token, isPublic);
  const edits = parseEdits(changeset.plan);
  // The plan is spent with the token, so a failed apply leaves no stored edits behind.
  await getPrisma().changeset.update({ where: { id: changeset.id }, data: { plan: Prisma.DbNull, previewExpiresAt: null } });
  try {
    return await getPrisma().$transaction(async (tx) => {
      const messages = await findMissingListValues(tx, edits);
      if (messages.length > 0) return { ok: false as const, reason: "blocked" as const, messages };
      const conflicts = await findConflicts(tx, edits);
      if (conflicts.length > 0) throw new ConflictAbort(conflicts);
      const items = await writeEdits(tx, edits);
      // The same description as the preview: names, links and grouping, saved for the Changes page.
      const described = await describeItems(tx, items);
      const labels = described.map((item) => withType(item.type, item.label));
      await tx.changesetItem.createMany({
        data: items.map((item, position) => ({
          label: labels[position],
          detail: itemDetail(described[position]) as unknown as Prisma.InputJsonValue,
          changesetId: changeset.id,
          position,
          tableName: modelInfo(item.type).table,
          recordId: item.id,
          action: item.op === "create" ? ("CREATE" as const) : ("UPDATE" as const),
          expectedRev: item.expectedRev,
          before: (item.before ?? Prisma.DbNull) as Prisma.InputJsonValue,
          after: item.after as Prisma.InputJsonValue,
        })),
      });
      await tx.changeset.update({
        where: { id: changeset.id },
        data: { status: "APPLIED", appliedAt: new Date(), plan: Prisma.DbNull, previewExpiresAt: null },
      });
      const applied = [];
      for (const [position, item] of items.entries()) applied.push({ op: item.op, record: labels[position] });
      return { ok: true as const, changesetId: changeset.id, applied };
    });
  } catch (err) {
    if (err instanceof ConflictAbort) return { ok: false, reason: "conflict", conflicts: await report(err.conflicts) };
    throw err;
  }
}
