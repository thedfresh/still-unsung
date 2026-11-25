import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { recentEvidence, saveAdminChanges } from "@/lib/data/changes/admin-save";
import { listChangesets } from "@/lib/data/changes/list";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CurrentUser, Role } from "@/lib/roles";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
let admin: CurrentUser;
let agent: CurrentUser;
let sourceId: number;
let setId: number;
let segmentId: number;

const asUser = (user: CurrentUser) => async (roles: readonly Role[]) => {
  if (!roles.includes(user.role)) throw new AppError("forbidden");
  return user;
};
const own = { ownKnowledge: true };

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  const adminRow = await addUser({ email: "admin@example.test", role: "ADMIN" });
  const agentRow = await addUser({ email: "agent@example.test", role: "AGENT" });
  admin = { id: adminRow.id, email: "admin@example.test", name: null, role: "ADMIN", via: "session" };
  agent = { id: agentRow.id, email: "agent@example.test", name: null, role: "AGENT", via: "token" };
  const source = await db.entity.create({ data: { kind: "SOURCE" } });
  await db.source.create({ data: { id: source.id, key: "k1", title: "Synthetic notebook" } });
  sourceId = source.id;
  const show = await db.entity.create({ data: { kind: "SHOW" } });
  await db.show.create({ data: { id: show.id, dateYear: 1978, dateMonth: 5, dateDay: 23 } });
  const set = await db.entity.create({ data: { kind: "SET" } });
  await db.set.create({ data: { id: set.id, showId: show.id, position: 1, setTypeId: (await db.setType.findFirstOrThrow()).id } });
  setId = set.id;
  const segment = await db.entity.create({ data: { kind: "SEGMENT" } });
  await db.segment.create({ data: { id: segment.id, setId, sortKey: "a", delivery: "SPOKEN", summary: "Old text." } });
  segmentId = segment.id;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("saveAdminChanges", () => {
  it("writes one ADMIN changeset with the user, the evidence and the items", async () => {
    const segment = await db.segment.findUniqueOrThrow({ where: { id: segmentId } });
    const result = await saveAdminChanges(
      { edits: [{ op: "update", type: "Segment", id: segmentId, rev: segment.rev, fields: { summary: "New text." } }], evidence: { sourceId, place: "page 4" } },
      asUser(admin),
    );
    expect(result.status).toBe("saved");
    const after = await db.segment.findUniqueOrThrow({ where: { id: segmentId } });
    expect(after.summary).toBe("New text.");
    expect(after.rev).toBe(segment.rev + 1);
    const sets = await db.changeset.findMany({ include: { items: true } });
    expect(sets).toHaveLength(1);
    expect(sets[0]).toMatchObject({ path: "ADMIN", status: "APPLIED", userId: admin.id, sourceId, place: "page 4", previewToken: null });
    expect(sets[0].items).toHaveLength(1);
    expect(sets[0].items[0]).toMatchObject({ tableName: "segments", recordId: segmentId, action: "UPDATE" });
    expect(sets[0].items[0].before).toMatchObject({ summary: "Old text." });
    const page = await listChangesets(1);
    expect(page.changes[0]).toMatchObject({ path: "ADMIN", userEmail: "admin@example.test" });
    expect(page.changes[0].evidence).toContain("Synthetic notebook");
  });

  it("writes nothing and returns both versions when the rev is stale", async () => {
    const segment = await db.segment.findUniqueOrThrow({ where: { id: segmentId } });
    const edit = (summary: string) => ({ op: "update", type: "Segment", id: segmentId, rev: segment.rev, fields: { summary } });
    expect((await saveAdminChanges({ edits: [edit("First tab.")], evidence: own }, asUser(admin))).status).toBe("saved");
    const result = await saveAdminChanges({ edits: [edit("Stale tab.")], evidence: own }, asUser(admin));
    expect(result.status).toBe("conflict");
    if (result.status !== "conflict") return;
    expect(result.messages[0]).toContain(`Segment ${segmentId} changed since you opened it`);
    expect(result.conflicts[0].yours).toEqual([{ field: "summary", value: "“Stale tab.”" }]);
    expect(result.conflicts[0].stored).toEqual([{ field: "summary", value: "“First tab.”" }]);
    expect((await db.segment.findUniqueOrThrow({ where: { id: segmentId } })).summary).toBe("First tab.");
    expect(await db.changeset.count({ where: { status: "APPLIED" } })).toBe(1);
  });

  it("creates a segment and a record that points at it in one save", async () => {
    const result = await saveAdminChanges(
      {
        edits: [
          { op: "create", type: "Segment", ref: "new", after: segmentId, fields: { setId, delivery: "SPOKEN", summary: "Inserted." } },
          { op: "create", type: "Citation", fields: { entityId: { ref: "new" }, sourceId, aspect: "SEGMENT_IDENTIFICATION" } },
        ],
        evidence: own,
      },
      asUser(admin),
    );
    expect(result.status).toBe("saved");
    const created = await db.segment.findFirstOrThrow({ where: { summary: "Inserted." } });
    expect(await db.citation.count({ where: { entityId: created.id } })).toBe(1);
    expect(await db.changeset.count({ where: { path: "ADMIN" } })).toBe(1);
  });

  it("says in words when a list value is missing", async () => {
    const result = await saveAdminChanges(
      { edits: [{ op: "create", type: "Set", fields: { showId: setId, position: 2, setTypeId: 999999 } }], evidence: own },
      asUser(admin),
    );
    expect(result.status).toBe("blocked");
    if (result.status === "blocked") expect(result.messages[0]).toContain("does not exist");
  });

  it("refuses a user who is not an admin, and writes nothing", async () => {
    const segment = await db.segment.findUniqueOrThrow({ where: { id: segmentId } });
    const input = { edits: [{ op: "update", type: "Segment", id: segmentId, rev: segment.rev, fields: { summary: "Nope." } }], evidence: own };
    await expect(saveAdminChanges(input, asUser(agent))).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      saveAdminChanges(input, async () => {
        throw new AppError("unauthorized");
      }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    expect(await db.changeset.count()).toBe(0);
    expect((await db.segment.findUniqueOrThrow({ where: { id: segmentId } })).summary).toBe("Old text.");
  });
});

describe("recentEvidence", () => {
  it("lists the five latest distinct choices of the user and skips own knowledge", async () => {
    const save = async (evidence: object, n: number) => {
      const segment = await db.segment.findUniqueOrThrow({ where: { id: segmentId } });
      await saveAdminChanges(
        { edits: [{ op: "update", type: "Segment", id: segmentId, rev: segment.rev, fields: { summary: `Text ${n}` } }], evidence },
        asUser(admin),
      );
    };
    await save(own, 0);
    for (let n = 1; n <= 7; n++) await save({ sourceId, place: `page ${n % 6}` }, n);
    const recent = await recentEvidence(admin.id);
    expect(recent).toHaveLength(5);
    expect(recent[0].evidence).toEqual({ sourceId, place: "page 1" });
    expect(new Set(recent.map((r) => r.label)).size).toBe(5);
    expect(await recentEvidence(agent.id)).toEqual([]);
  });
});
