import AxeBuilder from "@axe-core/playwright";
import type { APIRequestContext } from "@playwright/test";
import { expect, test } from "../support/e2e";
import { seedSignedInUser } from "../support/auth-fixtures";

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

test.describe("the MCP endpoint", () => {
  test("refuses a request with no sign-in and a wrong token", async ({ request }) => {
    const none = await request.post("/api/v1/mcp", { headers: HEADERS, data: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(none.status()).toBe(401);
    const wrong = await request.post("/api/v1/mcp", {
      headers: { ...HEADERS, Authorization: "Bearer suat_wrong" },
      data: { jsonrpc: "2.0", id: 1, method: "tools/list" },
    });
    expect(wrong.status()).toBe(401);
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
    const again = await callTool(request, token, "apply_changes", { token: token2 });
    expect(again.isError).toBe(true);

    await page.goto("/admin/changes");
    await expect(page.getByRole("heading", { level: 1, name: "Changes" })).toBeVisible();
    const change = page.locator("details", { hasText: agent.email }).first();
    await change.locator("summary").click();
    await expect(change.locator("summary")).toContainText("Added 1 show.");
    await expect(change).toContainText(`New · Show ${year}-03-04`);
    await expect(change).toContainText("own knowledge");
    const results = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    expect(results.violations).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
