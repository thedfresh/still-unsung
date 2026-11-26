import { randomUUID } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../support/e2e";
import { query, seedSignedInUser } from "../support/auth-fixtures";

const WCAG = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const HEADERS = { Accept: "application/json, text/event-stream", "Content-Type": "application/json" };

let nextId = 1;
async function rpc(request: APIRequestContext, token: string, method: string, params: object) {
  return request.post("/api/v1/mcp", {
    headers: { ...HEADERS, Authorization: `Bearer ${token}` },
    data: { jsonrpc: "2.0", id: nextId++, method, params },
  });
}

async function callTool(request: APIRequestContext, token: string, name: string, args: object) {
  const res = await rpc(request, token, "tools/call", { name, arguments: args });
  expect(res.status()).toBe(200);
  const body = await res.json();
  return { text: body.result.content[0].text as string, isError: Boolean(body.result.isError) };
}

/** Make the private import rules page when the test database has none. Plain SQL, synthetic text. */
async function ensureImportRulesPage(): Promise<number> {
  const found = await query<{ id: number }>(`SELECT id FROM guide_pages WHERE slug = 'agent-import-rules'`);
  if (found.length > 0) return found[0].id;
  const rows = await query<{ id: number }>(`INSERT INTO entities (kind, "isPublic") VALUES ('GUIDE_PAGE', false) RETURNING id`);
  await query(
    `INSERT INTO guide_pages (id, title, body, slug, "updatedAt") VALUES ($1, 'Agent import rules', 'Placeholder.', 'agent-import-rules', now())`,
    [rows[0].id],
  );
  return rows[0].id;
}

test.describe("the MCP endpoint", () => {
  test("tells a new client to read the import rules, serves them, and shows an edit at once", async ({ context, baseURL, page, request }, testInfo) => {
    // All projects edit the same page, so only the desktop project runs this test.
    test.skip(testInfo.project.name !== "desktop", "The projects share one rules page.");
    const admin = await seedSignedInUser("ADMIN");
    const agent = await seedSignedInUser("AGENT");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    await page.goto("/admin/tokens");
    await page.getByLabel("Agent user").selectOption({ label: agent.email });
    await page.getByLabel("Label").fill("rules e2e");
    await page.getByRole("button", { name: "Make token" }).click();
    const token = (await page.getByTestId("new-token").textContent())!;
    const pageId = await ensureImportRulesPage();

    const init = await rpc(request, token, "initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "e2e", version: "1" },
    });
    expect((await init.json()).result.instructions).toContain("get_import_rules");

    const first = await callTool(request, token, "get_import_rules", {});
    expect(first.isError).toBe(false);
    expect(first.text).toMatch(/^Import rules \(rev \d+\):/);
    const rev = Number(/rev (\d+)/.exec(first.text)![1]);

    const words = `Rules text ${Date.now()}`;
    const preview = await callTool(request, token, "preview_changes", {
      evidence: { ownKnowledge: true },
      edits: [{ op: "update", type: "GuidePage", id: pageId, rev, fields: { body: words } }],
    });
    expect(preview.isError).toBe(false);
    const applied = await callTool(request, token, "apply_changes", { token: /Apply token: (suprev_\S+)/.exec(preview.text)![1] });
    expect(applied.isError).toBe(false);
    const second = await callTool(request, token, "get_import_rules", {});
    expect(second.text).toContain(words);
    expect(second.text).toContain(`rev ${rev + 1}`);

    // An agent cannot make the page public, rename it or delete it.
    const refusedEdits = [
      { op: "update", type: "GuidePage", id: pageId, rev: rev + 1, fields: { isPublic: true } },
      { op: "update", type: "GuidePage", id: pageId, rev: rev + 1, fields: { slug: "other" } },
      { op: "delete", type: "GuidePage", id: pageId, rev: rev + 1 },
    ];
    for (const edit of refusedEdits) {
      const refused = await callTool(request, token, "preview_changes", { evidence: { ownKnowledge: true }, edits: [edit] });
      expect(refused.text).toContain("The import rules page stays private");
      expect(refused.text).not.toContain("Apply token");
    }

    // The rules are on no public page, and the home page does not carry them.
    const home = await request.get("/");
    expect(await home.text()).not.toContain(words);
    const missing = await request.get("/agent-import-rules");
    expect(missing.status()).toBe(404);
    expect(await missing.text()).not.toContain(words);
  });

  test("refuses a request with no sign-in and a wrong token", async ({ request }) => {
    const none = await request.post("/api/v1/mcp", { headers: HEADERS, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(none.status()).toBe(401);
    const wrong = await request.post("/api/v1/mcp", {
      headers: { ...HEADERS, Authorization: "Bearer suat_wrong" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(wrong.status()).toBe(401);
  });

  test("get_import_rules is refused with no token and with a wrong token", async ({ request }) => {
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_import_rules", arguments: {} } };
    expect((await request.post("/api/v1/mcp", { headers: HEADERS, data: call })).status()).toBe(401);
    const wrong = await request.post("/api/v1/mcp", { headers: { ...HEADERS, Authorization: "Bearer suat_wrong" }, data: call });
    expect(wrong.status()).toBe(401);
  });

  test("get_import_rules is refused with an admin session", async ({ context, baseURL }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    const call = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get_import_rules", arguments: {} } };
    const res = await context.request.post("/api/v1/mcp", { headers: HEADERS, data: call });
    expect([401, 403]).toContain(res.status());
  });

  test("refuses an admin session cookie: only an agent token opens it", async ({ context, baseURL, request }) => {
    const admin = await seedSignedInUser("ADMIN");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    const res = await context.request.post("/api/v1/mcp", { headers: HEADERS, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect([401, 403]).toContain(res.status());
    expect(request).toBeTruthy();
  });

  test("an agent previews and applies a change, and the admin sees it in the list of changes", async ({ page, context, baseURL, request }) => {
    const admin = await seedSignedInUser("ADMIN");
    const agent = await seedSignedInUser("AGENT");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);

    // The admin makes a token for the agent user.
    await page.goto("/admin/tokens");
    await page.getByLabel("Agent user").selectOption({ label: agent.email });
    await page.getByLabel("Label").fill("mcp e2e");
    await page.getByRole("button", { name: "Make token" }).click();
    const token = (await page.getByTestId("new-token").textContent())!;

    const list = await rpc(request, token, "tools/list", {});
    expect((await list.json()).result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "apply_changes",
      "get_import_rules",
      "get_record",
      "preview_changes",
      "search_records",
    ]);

    const year = 1900 + Math.floor(Math.random() * 90);
    const preview = await callTool(request, token, "preview_changes", {
      evidence: { ownKnowledge: true },
      edits: [{ op: "create", type: "Show", fields: { dateYear: year, dateMonth: 3, dateDay: 4 } }],
    });
    expect(preview.isError).toBe(false);
    expect(preview.text.startsWith("Added 1 show.")).toBe(true);
    expect(preview.text).toContain(`New Show ${year}-03-04`);
    const token2 = /Apply token: (suprev_\S+)/.exec(preview.text)![1];

    // A forbidden table is refused.
    const refused = await callTool(request, token, "preview_changes", {
      evidence: { ownKnowledge: true },
      edits: [{ op: "create", type: "User", fields: { email: "x@example.test", role: "ADMIN" } }],
    });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain("invalid_input");

    const applied = await callTool(request, token, "apply_changes", { token: token2 });
    expect(applied.text).toContain("Applied as changeset");

    // The agent cites the new show, then previews a delete of the citation, sees "Deleted" and applies it.
    // The show is found by the ID that its own change stored, not by date: other projects run in parallel
    // and may make a show with the same date.
    const changesetId = Number(/Applied as changeset (\d+)/.exec(applied.text)![1]);
    const items = await query<{ recordId: number }>(`SELECT "recordId" FROM changeset_items WHERE "changesetId" = $1 AND "tableName" = 'shows'`, [changesetId]);
    expect(items).toHaveLength(1);
    const showId = items[0].recordId;
    const cite = await callTool(request, token, "preview_changes", {
      evidence: { ownKnowledge: true },
      edits: [
        { op: "create", type: "Source", ref: "src", fields: { key: `e2e-${randomUUID()}`, title: "A test notebook" } },
        { op: "create", type: "Citation", fields: { entityId: showId, sourceId: { ref: "src" }, place: "page 1" } },
      ],
    });
    expect(cite.isError).toBe(false);
    await callTool(request, token, "apply_changes", { token: /Apply token: (suprev_\S+)/.exec(cite.text)![1] });
    const shown = JSON.parse((await callTool(request, token, "get_record", { type: "Show", id: showId })).text);
    const citation = shown.attachments.citations[0];
    const removal = await callTool(request, token, "preview_changes", {
      evidence: { ownKnowledge: true },
      edits: [{ op: "delete", type: "Citation", id: citation.id, rev: citation.rev }],
    });
    expect(removal.isError).toBe(false);
    expect(removal.text).toContain("Deleted · Citation");
    await callTool(request, token, "apply_changes", { token: /Apply token: (suprev_\S+)/.exec(removal.text)![1] });
    const after = JSON.parse((await callTool(request, token, "get_record", { type: "Show", id: showId })).text);
    expect(after.attachments.citations).toHaveLength(0);

    const again = await callTool(request, token, "apply_changes", { token: token2 });
    expect(again.isError).toBe(true);

    await page.goto("/admin/changes");
    await expect(page.getByRole("heading", { level: 1, name: "Changes" })).toBeVisible();
    const removed = page.locator("details", { hasText: agent.email }).filter({ hasText: "Deleted 1 citation." }).first();
    await removed.locator("summary").click();
    await expect(removed).toContainText("Deleted · Citation");
    const change = page.locator("details", { hasText: agent.email }).filter({ hasText: "Added 1 show." }).first();
    await change.locator("summary").click();
    await expect(change.locator("summary")).toContainText("Added 1 show.");
    await expect(change).toContainText(`New · Show ${year}-03-04`);
    await expect(change).toContainText("own knowledge");
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("a preview ends with a link to its page, and the admin reads the same counts as cards", async ({ browser, page, context, baseURL, request }) => {
    const admin = await seedSignedInUser("ADMIN");
    const agent = await seedSignedInUser("AGENT");
    await context.addCookies([{ name: "authjs.session-token", value: admin.sessionToken, url: baseURL! }]);
    await page.goto("/admin/tokens");
    await page.getByLabel("Agent user").selectOption({ label: agent.email });
    await page.getByLabel("Label").fill("preview page e2e");
    await page.getByRole("button", { name: "Make token" }).click();
    const token = (await page.getByTestId("new-token").textContent())!;

    const year = 1900 + Math.floor(Math.random() * 90);
    const preview = await callTool(request, token, "preview_changes", {
      evidence: { ownKnowledge: true },
      edits: [{ op: "create", type: "Show", fields: { dateYear: year, dateMonth: 6, dateDay: 7 } }],
    });
    expect(preview.isError).toBe(false);
    const link = /(\S+\/admin\/changes\/pending\/\d+)\s*$/.exec(preview.text)![1];
    expect(link.startsWith(baseURL!)).toBe(true);
    const counts = preview.text.split("\n")[0];

    // A signed-out request reads nothing.
    const signedOut = await request.get(link, { maxRedirects: 0 });
    expect(await signedOut.text()).not.toContain(counts);
    expect(await signedOut.text()).not.toContain("This preview is open");
    const anonymous = await browser.newContext();
    const anonymousPage = await anonymous.newPage();
    await anonymousPage.goto(link);
    await expect(anonymousPage).toHaveURL(/\/admin\/sign-in/);
    await expect(anonymousPage.getByText(counts, { exact: true })).toHaveCount(0);
    await anonymous.close();

    await page.goto(link);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Preview");
    await expect(page.getByText(counts, { exact: true })).toBeVisible();
    await expect(page.getByText(`New · Show ${year}-06-07`)).toBeVisible();
    await expect(page.getByRole("status")).toContainText("This preview is open");
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // The list shows it with its counts.
    await page.goto("/admin/changes/pending");
    const path = new URL(link).pathname;
    await expect(page.locator(`a[href="${path}"]`)).toHaveText(counts);
    const axeList = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(axeList.violations).toEqual([]);

    // An unknown preview is a real 404.
    const missing = await page.goto("/admin/changes/pending/2147483000");
    expect(missing?.status()).toBe(404);
  });
});
