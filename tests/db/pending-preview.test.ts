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

async function makeSource() {
  const entity = await db.entity.create({ data: { kind: "SOURCE" } });
  return db.source.create({ data: { id: entity.id, key: "k1", title: "Synthetic notebook" } });
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

  it("warns, and does not crash, when the plan no longer fits the database (HSA-170)", async () => {
    // Preview a delete of a show, then add a set to the show. The show keeps rev 1.
    const show = await makeShow();
    const preview = await previewChanges(agentId, { evidence: own, edits: [{ op: "delete", type: "Show", id: show.id, rev: show.rev }] });
    expect(preview.warnings).toEqual([]);
    const setTypeId = (await db.setType.findFirstOrThrow()).id;
    await db.set.create({ data: { id: (await db.entity.create({ data: { kind: "SET" } })).id, showId: show.id, position: 1, setTypeId } });
    const page = await getPendingPreview(preview.changesetId as number);
    expect(page?.state).toBe("open");
    expect(page?.readout).toBeNull();
    expect(page?.warnings[0]).toMatch(/^Edit 0: Show .* cannot be deleted\. It still has 1 set attached/);
  });

  it("warns when a record the plan deletes has gone (HSA-170)", async () => {
    const show = await makeShow();
    const citation = await db.citation.create({ data: { entityId: show.id, sourceId: (await makeSource()).id, place: "p. 1" } });
    const preview = await previewChanges(agentId, { evidence: own, edits: [{ op: "delete", type: "Citation", id: citation.id, rev: citation.rev }] });
    await db.citation.delete({ where: { id: citation.id } });
    const page = await getPendingPreview(preview.changesetId as number);
    expect(page?.readout).toBeNull();
    expect(page?.warnings[0]).toContain(`Citation ${citation.id}`);
  });

  it("points an applied change to the page of the Changes log that lists it (HSA-170)", async () => {
    const first = await previewChanges(agentId, { evidence: own, edits: [createShow(1960)] });
    await applyChanges(agentId, first.token as string);
    const rows = [];
    for (let i = 0; i < 51; i++) {
      const next = await previewChanges(agentId, { evidence: own, edits: [createShow(1961 + i)] });
      await applyChanges(agentId, next.token as string);
      rows.push(next);
    }
    expect((await getPendingPreview(first.changesetId as number))?.appliedPage).toBe(2);
    expect((await getPendingPreview(rows[rows.length - 1].changesetId as number))?.appliedPage).toBe(1);
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
