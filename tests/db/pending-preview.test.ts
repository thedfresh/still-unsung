import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { applyChanges } from "@/lib/data/changes/apply";
import { getPendingPreview, listPendingPreviews } from "@/lib/data/changes/pending";
import { previewChanges } from "@/lib/data/changes/preview";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { formatPreview } from "@/lib/changes/preview-format";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
const own = { ownKnowledge: true };
let agentId: string;

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  agentId = (await addUser({ email: "agent@example.test", role: "AGENT" })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

const createShow = (year: number) => ({ op: "create", type: "Show", fields: { dateYear: year } });

async function makeShow() {
  const preview = await previewChanges(agentId, { evidence: own, edits: [createShow(1978)] });
  await applyChanges(agentId, preview.token as string);
  return db.show.findFirstOrThrow();
}

async function rowCounts() {
  return [await db.show.count(), await db.entity.count(), await db.changesetItem.count(), await db.changeset.count()];
}

describe("pending preview page (HSA-169)", () => {
  it("rebuilds an open preview as cards without writing", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: own,
      edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Late" } }, createShow(1979)],
    });
    const before = await rowCounts();
    const page = await getPendingPreview(preview.changesetId as number);
    expect(await rowCounts()).toEqual(before);
    expect(page?.state).toBe("open");
    expect(page?.userEmail).toBe("agent@example.test");
    expect(page?.evidence).toBe("own knowledge");
    // The page says the same counts as the preview text.
    expect(page?.readout?.counts).toBe("Added 1 show; changed 1 show.");
    expect(formatPreview(preview).startsWith(page?.readout?.counts as string)).toBe(true);
    const cards = page?.readout?.groups.flatMap((g) => g.cards) ?? [];
    expect(cards.find((c) => c.action === "Changed")?.showId).toBe(show.id);
    expect(cards.find((c) => c.action === "New")?.showId).toBeUndefined();
  });

  it("lists open previews newest first, with counts", async () => {
    const first = await previewChanges(agentId, { evidence: own, edits: [createShow(1970)] });
    const second = await previewChanges(agentId, { evidence: own, edits: [createShow(1971)] });
    const lines = await listPendingPreviews();
    expect(lines.map((l) => l.id)).toEqual([second.changesetId, first.changesetId]);
    expect(lines[0].counts).toBe("Added 1 show.");
  });

  it("reads an expired preview as expired and an applied one as applied, and lists neither", async () => {
    const expired = await previewChanges(agentId, { evidence: own, edits: [createShow(1972)] });
    await db.changeset.update({ where: { id: expired.changesetId as number }, data: { previewExpiresAt: new Date(Date.now() - 60_000) } });
    const applied = await previewChanges(agentId, { evidence: own, edits: [createShow(1973)] });
    await applyChanges(agentId, applied.token as string);
    const before = await rowCounts();
    const page = await getPendingPreview(expired.changesetId as number);
    expect(page?.state).toBe("expired");
    expect(page?.readout).toBeNull();
    expect((await getPendingPreview(applied.changesetId as number))?.state).toBe("applied");
    expect(await getPendingPreview(999_999)).toBeNull();
    expect(await rowCounts()).toEqual(before);
    expect(await listPendingPreviews()).toEqual([]);
  });

  it("warns when a record changed after the preview", async () => {
    const show = await makeShow();
    const preview = await previewChanges(agentId, {
      evidence: own,
      edits: [{ op: "update", type: "Show", id: show.id, rev: show.rev, fields: { timeLabel: "Late" } }],
    });
    await db.show.update({ where: { id: show.id }, data: { timeLabel: "Early", rev: { increment: 1 } } });
    const page = await getPendingPreview(preview.changesetId as number);
    expect(page?.readout).toBeNull();
    expect(page?.warnings[0]).toContain("changed since you read it");
  });
});
