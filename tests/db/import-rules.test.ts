import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedImportRulesPage, seedLists } from "../../prisma/seed/index.ts";
import { isPrivateText } from "@/lib/changes/labels";
import { createContentMcpServer } from "@/lib/mcp/server";
import { applyChanges } from "@/lib/data/changes/apply";
import { previewChanges } from "@/lib/data/changes/preview";
import { getImportRules, getPublicGuidePage, listPublicGuidePages } from "@/lib/data/guide-pages";
import { addUser } from "@/lib/data/users";
import { getPrisma } from "@/lib/db";
import { IMPORT_RULES_PLACEHOLDER, IMPORT_RULES_SLUG, MCP_INSTRUCTIONS } from "@/lib/import-rules";
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

  it("refuses agent edits that expose, rename or delete the page", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    const edits = [
      { op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { isPublic: true } },
      { op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { slug: "other" } },
      { op: "delete", type: "GuidePage", id: page.id, rev: page.rev },
    ];
    for (const edit of edits) {
      const preview = await previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [edit] });
      expect(preview.token).toBeNull();
      expect(preview.warnings.join(" ")).toContain("The import rules page stays private; only its body can change.");
    }
    expect((await db.entity.findUniqueOrThrow({ where: { id: page.id } })).isPublic).toBe(false);
    expect((await getImportRules()).rev).toBe(page.rev);
  });

  it("keeps a change to the page private, whatever the caller passes", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    const preview = await previewChanges(agentId, {
      evidence: { ownKnowledge: true },
      isPublic: true,
      edits: [{ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { body: "More rules." } }],
    });
    expect(preview.isPublic).toBe(false);
    const result = await applyChanges(agentId, preview.token as string, true);
    expect(result.ok).toBe(true);
    const changesets = await db.changeset.findMany();
    expect(changesets.length).toBeGreaterThan(0);
    expect(changesets.every((c) => c.isPublic === false)).toBe(true);
  });

  it("takes a body of 100,000 characters and refuses more", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    const edit = (body: string) => ({ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { body } });
    const ok = await previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [edit("a".repeat(100_000))] });
    expect(ok.token).not.toBeNull();
    await expect(previewChanges(agentId, { evidence: { ownKnowledge: true }, edits: [edit("a".repeat(100_001))] })).rejects.toThrow();
  });

  it("gives a plain error when the page is missing", async () => {
    await db.guidePage.deleteMany({ where: { slug: IMPORT_RULES_SLUG } });
    await expect(getImportRules()).rejects.toThrow(/import rules page does not exist/);
    // The connect-time text is fixed: it does not read the page.
    expect(MCP_INSTRUCTIONS).toContain("get_import_rules");
  });
});

describe("the import rules page guard (HSA-170)", () => {
  const own = { ownKnowledge: true };

  it("refuses a create with the rules slug when the page is missing, and a rename to it", async () => {
    await db.guidePage.deleteMany({ where: { slug: IMPORT_RULES_SLUG } });
    const entity = await db.entity.create({ data: { kind: "GUIDE_PAGE" } });
    const other = await db.guidePage.create({ data: { id: entity.id, slug: "about", title: "About", body: "Hello." } });
    const edits = [
      { op: "create", type: "GuidePage", fields: { slug: IMPORT_RULES_SLUG, title: "Rules", body: "x", isPublic: true } },
      { op: "update", type: "GuidePage", id: other.id, rev: other.rev, fields: { slug: IMPORT_RULES_SLUG } },
    ];
    for (const edit of edits) {
      const preview = await previewChanges(agentId, { evidence: own, isPublic: true, edits: [edit] });
      expect(preview.token).toBeNull();
      expect(preview.warnings.join(" ")).toContain("belongs to the private import rules page");
    }
    expect(await db.guidePage.count({ where: { slug: IMPORT_RULES_SLUG } })).toBe(0);
    expect(await db.changeset.count()).toBe(0);
  });

  it("refuses on apply, not only on preview", async () => {
    await seedImportRulesPage(db);
    const page = await db.guidePage.findUniqueOrThrow({ where: { slug: IMPORT_RULES_SLUG } });
    // A harmless plan passes the preview. Then the stored plan is swapped for a refused one.
    const preview = await previewChanges(agentId, {
      evidence: own,
      edits: [{ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { body: "Fine." } }],
    });
    const refused = [{ op: "update", type: "GuidePage", id: page.id, rev: page.rev, fields: { isPublic: true } }];
    await db.changeset.update({ where: { id: preview.changesetId as number }, data: { plan: refused } });
    const result = await applyChanges(agentId, preview.token as string);
    expect(result).toMatchObject({ ok: false, reason: "blocked" });
    expect(JSON.stringify(result)).toContain("The import rules page stays private");
    expect((await db.entity.findUniqueOrThrow({ where: { id: page.id } })).isPublic).toBe(false);
    expect((await getImportRules()).body).not.toBe("Fine.");
  });

  it("reads the title of a private guide page as private text", () => {
    expect(isPrivateText("GuidePage", "title", { isPublic: false })).toBe(true);
    expect(isPrivateText("GuidePage", "title", { isPublic: true })).toBe(false);
  });

  it("gives get_import_rules a plain error through the MCP tool when the page is missing", async () => {
    await db.guidePage.deleteMany({ where: { slug: IMPORT_RULES_SLUG } });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    const server = createContentMcpServer({ id: agentId, email: "agent@example.test", name: null, role: "AGENT", via: "token" });
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
    const result = (await client.callTool({ name: "get_import_rules", arguments: {} })) as { isError?: boolean; content: Array<{ text: string }> };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("The import rules page does not exist yet");
    await client.close();
  });
});
