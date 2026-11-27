import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { applyChanges } from "@/lib/data/changes/apply";
import { previewChanges } from "@/lib/data/changes/preview";
import { getRecord } from "@/lib/data/records";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { formatPreview } from "@/lib/changes/preview-format";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
let agentId: string;
let sourceId: number;

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  agentId = (await addUser({ email: "agent@example.test", role: "AGENT" })).id;
  const source = await db.entity.create({ data: { kind: "SOURCE" } });
  await db.source.create({ data: { id: source.id, zoteroKey: "ZK1", key: "k1", title: "Synthetic book", zoteroData: {}, syncedAt: new Date() } });
  sourceId = source.id;
});
afterAll(async () => {
  await db.$disconnect();
});

const evidence = () => ({ sourceId, place: "page 211" });

async function makeWork(title: string) {
  const entity = await db.entity.create({ data: { kind: "WORK" } });
  const workKindId = (await db.workKind.findFirstOrThrow()).id;
  await db.work.create({ data: { id: entity.id, title, workKindId } });
  return entity.id;
}

async function makePassage(workId: number, label: string) {
  const entity = await db.entity.create({ data: { kind: "PASSAGE" } });
  await db.passage.create({ data: { id: entity.id, workId, label } });
  return entity.id;
}

async function setup() {
  const workId = await makeWork("Synthetic Song");
  const otherWorkId = await makeWork("Another Synthetic Song");
  const passageId = await makePassage(workId, "verse 2");
  const otherPassageId = await makePassage(otherWorkId, "verse 1");
  const person = await db.entity.create({ data: { kind: "PERSON" } });
  await db.person.create({ data: { id: person.id, name: "Synthetic Writer", key: "synthetic-writer" } });
  const roleId = (await db.creditRole.findFirstOrThrow()).id;
  return { workId, otherWorkId, passageId, otherPassageId, personId: person.id, roleId };
}

type Setup = Awaited<ReturnType<typeof setup>>;

function creditFields(s: Setup, extra: Record<string, unknown>) {
  return { personId: s.personId, roleId: s.roleId, kind: "AS_CREDITED", ...extra };
}

describe("credit for one passage (item 123)", () => {
  it("previews, applies and reads back a credit for one passage", async () => {
    const s = await setup();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Credit", fields: creditFields(s, { workId: s.workId, passageId: s.passageId }) }],
    });
    expect(preview.warnings).toEqual([]);
    expect(formatPreview(preview)).toContain("verse 2");
    expect(await db.credit.count()).toBe(0);
    await applyChanges(agentId, preview.token as string);
    const credit = await db.credit.findFirstOrThrow();
    expect(credit.passageId).toBe(s.passageId);
    const read = await getRecord("Credit", { id: credit.id });
    expect(read.passageId).toBe(s.passageId);
  });

  it("still allows a credit with no passage", async () => {
    const s = await setup();
    const preview = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Credit", fields: creditFields(s, { workId: s.workId }) }],
    });
    await applyChanges(agentId, preview.token as string);
    expect((await db.credit.findFirstOrThrow()).passageId).toBeNull();
  });

  it("refuses a passage from a different work", async () => {
    const s = await setup();
    await expect(
      previewChanges(agentId, {
        evidence: evidence(),
        edits: [{ op: "create", type: "Credit", fields: creditFields(s, { workId: s.workId, passageId: s.otherPassageId }) }],
      }),
    ).rejects.toThrow(/belongs to another work/);
  });

  it("refuses a passage on a credit for a version, which names no work", async () => {
    const s = await setup();
    const entity = await db.entity.create({ data: { kind: "VERSION" } });
    await db.version.create({ data: { id: entity.id, workId: s.workId, name: "Synthetic version" } });
    await expect(
      previewChanges(agentId, {
        evidence: evidence(),
        edits: [{ op: "create", type: "Credit", fields: creditFields(s, { versionId: entity.id, passageId: s.passageId }) }],
      }),
    ).rejects.toThrow(/must also name the work/);
  });

  it("refuses an update that moves the credit to another work and keeps the passage", async () => {
    const s = await setup();
    const make = await previewChanges(agentId, {
      evidence: evidence(),
      edits: [{ op: "create", type: "Credit", fields: creditFields(s, { workId: s.workId, passageId: s.passageId }) }],
    });
    await applyChanges(agentId, make.token as string);
    const credit = await db.credit.findFirstOrThrow();
    await expect(
      previewChanges(agentId, {
        evidence: evidence(),
        edits: [{ op: "update", type: "Credit", id: credit.id, rev: credit.rev, fields: { workId: s.otherWorkId } }],
      }),
    ).rejects.toThrow(/belongs to another work/);
  });
});
