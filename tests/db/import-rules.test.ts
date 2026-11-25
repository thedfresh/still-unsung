import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedImportRulesPage, seedLists } from "../../prisma/seed/index.ts";
import { applyChanges } from "@/lib/data/changes/apply";
import { previewChanges } from "@/lib/data/changes/preview";
import { getImportRules, getPublicGuidePage, listPublicGuidePages } from "@/lib/data/guide-pages";
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

describe("the import rules page", () => {
  it("is seeded once, private, with a placeholder body", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findMany({ where: { slug: IMPORT_RULES_SLUG }, include: { entity: true } });
    expect(page).toHaveLength(1);
    expect(page[0].entity.isPublic).toBe(false);
    expect(page[0].body).toBe(IMPORT_RULES_PLACEHOLDER);
  });

  it("does not overwrite a page that the curator edited", async () => {
    await db.guidePage.update({ where: { slug: IMPORT_RULES_SLUG }, data: { body: "Edited rules." } });
    await seedImportRulesPage(db);
    expect((await getImportRules()).body).toBe("Edited rules.");
  });

  it("never comes back from a public read", async () => {
    expect(await getPublicGuidePage(IMPORT_RULES_SLUG)).toBeNull();
    expect(await listPublicGuidePages()).toEqual([]);
  });

  it("shows a public guide page to a public read", async () => {
    const entity = await db.entity.create({ data: { kind: "GUIDE_PAGE" } });
    await db.guidePage.create({ data: { id: entity.id, slug: "about", title: "About", body: "Hello." } });
    expect((await getPublicGuidePage("about"))?.title).toBe("About");
    expect((await listPublicGuidePages()).map((page) => page.slug)).toEqual(["about"]);
  });

  it("returns the new text after an update through preview and apply", async () => {
    const before = await getImportRules();
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { body: "New rules." } }],
    });
    await applyChanges(agentId, preview.token as string);
    const after = await getImportRules();
    expect(after.body).toBe("New rules.");
    expect(after.rev).toBe(before.rev + 1);
    const entity = await db.entity.findUniqueOrThrow({ where: { id: page.id } });
    expect(entity.isPublic).toBe(false);
  });
});
