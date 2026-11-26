import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedImportRulesPage, seedLists } from "../../prisma/seed/index.ts";
import { applyChanges } from "@/lib/data/changes/apply";
import { previewChanges } from "@/lib/data/changes/preview";
import { getImportRulesForAdmin } from "@/lib/data/guide-pages";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { IMPORT_RULES_PLACEHOLDER, IMPORT_RULES_SLUG } from "@/lib/import-rules";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();
let agentId: string;

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
  agentId = (await addUser({ email: "agent@example.test", role: "AGENT" })).id;
});
afterAll(async () => {
  await db.$disconnect();
});

describe("the import rules for the admin page", () => {
  it("is null when the page does not exist", async () => {
    const page = await db.guidePage.findUnique({ where: { slug: IMPORT_RULES_SLUG } });
    if (page) await db.entity.delete({ where: { id: page.id } });
    expect(await getImportRulesForAdmin()).toBeNull();
  });

  it("reads the page with no change in the log yet", async () => {
    await seedImportRulesPage(db);
    const rules = await getImportRulesForAdmin();
    expect(rules).toMatchObject({ body: IMPORT_RULES_PLACEHOLDER, rev: 1, lastChange: null });
  });

  it("reads the private page and names the change that made the last edit", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    expect((await db.entity.findUniqueOrThrow({ where: { id: page.id } })).isPublic).toBe(false);
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { body: "## Rules\n\nNew rules." } }],
    });
    await applyChanges(agentId, preview.token as string);
    const changeset = await db.changeset.findFirstOrThrow({ where: { status: "APPLIED" } });
    const rules = await getImportRulesForAdmin();
    expect(rules).toMatchObject({ body: "## Rules\n\nNew rules.", rev: 2, lastChange: { id: changeset.id, page: 1 } });
  });

  it("points at the page of the log that lists the change", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { body: "Older rules." } }],
    });
    await applyChanges(agentId, preview.token as string);
    const mine = await db.changeset.findFirstOrThrow({ where: { status: "APPLIED" } });
    // 50 newer changes push the rules change to page 2 of the log.
    await db.changeset.createMany({
      data: Array.from({ length: 50 }, (_, i) => ({
        userId: agentId,
        path: "MCP" as const,
        status: "APPLIED" as const,
        summary: `later ${i}`,
        ownKnowledge: true,
        appliedAt: new Date(mine.appliedAt!.getTime() + 1000 * (i + 1)),
      })),
    });
    expect((await getImportRulesForAdmin())?.lastChange).toEqual({ id: mine.id, page: 2 });
  });
});
