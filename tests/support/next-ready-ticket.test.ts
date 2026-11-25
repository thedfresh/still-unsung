import { execFile } from "node:child_process";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "next-ready-ticket.mjs");

type Issue = { key: string; fields: { labels: string[]; statuscategorychangedate: string } };
const issue = (key: string, changed: string, labels: string[] = []): Issue => ({
  key,
  fields: { labels, statuscategorychangedate: changed },
});

let server: Server | undefined;
afterEach(() => server?.close());

// A fake GitHub and Jira in one server. It records the dispatch request.
async function setup(options: { issues: Issue[]; runs?: object[] }) {
  const dispatches: unknown[] = [];
  server = createServer(async (req: IncomingMessage, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    res.setHeader("Content-Type", "application/json");
    if (req.url?.includes("/actions/workflows/claude-agent.yml/runs")) {
      res.end(JSON.stringify({ workflow_runs: options.runs ?? [] }));
    } else if (req.url === "/rest/api/3/search/jql") {
      res.end(JSON.stringify({ issues: options.issues }));
    } else if (req.url?.endsWith("/dispatches")) {
      dispatches.push(JSON.parse(body));
      res.statusCode = 204;
      res.end();
    } else {
      res.statusCode = 404;
      res.end("{}");
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { url, dispatches };
}

function run(url: string, env: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      "node",
      [script],
      {
        env: {
          ...process.env,
          JIRA_EMAIL: "agent@example.test",
          JIRA_TOKEN: "synthetic-token",
          GH_TOKEN: "synthetic-github-token",
          GITHUB_REPOSITORY: "owner/repo",
          GITHUB_API_URL: url,
          JIRA_URL: url,
          GITHUB_RUN_ID: "100",
          TICKET: "HSA-1",
          TRIED: "",
          ...env,
        },
      },
      (error, stdout, stderr) => (error ? reject(new Error(stderr || String(error))) : resolve(stdout)),
    );
  });
}

describe("next-ready-ticket", () => {
  it("starts a run for the oldest Ready ticket", async () => {
    const { url, dispatches } = await setup({
      issues: [
        issue("HSA-12", "2026-11-25T10:00:20.000-0500"),
        issue("HSA-10", "2026-11-25T10:00:00.000-0500", ["Fable"]),
        issue("HSA-11", "2026-11-25T10:00:10.000-0500"),
      ],
    });
    await run(url);
    expect(dispatches).toEqual([{ ref: "main", inputs: { ticket: "HSA-10", model: "fable", tried: "HSA-1" } }]);
  });

  it("skips the ticket of this run and the tickets of earlier runs in the chain", async () => {
    const { url, dispatches } = await setup({
      issues: [
        issue("HSA-1", "2026-11-25T10:00:00.000-0500"),
        issue("HSA-2", "2026-11-25T10:00:01.000-0500"),
        issue("HSA-3", "2026-11-25T10:00:02.000-0500", ["opus"]),
      ],
    });
    await run(url, { TICKET: "HSA-1", TRIED: "HSA-2" });
    expect(dispatches).toEqual([{ ref: "main", inputs: { ticket: "HSA-3", model: "opus", tried: "HSA-2,HSA-1" } }]);
  });

  it("starts nothing when the queue is empty", async () => {
    const { url, dispatches } = await setup({ issues: [issue("HSA-1", "2026-11-25T10:00:00.000-0500")] });
    const out = await run(url);
    expect(dispatches).toEqual([]);
    expect(out).toContain("queue is empty");
  });

  it("starts nothing when another ticket run is waiting or running", async () => {
    const { url, dispatches } = await setup({
      issues: [issue("HSA-2", "2026-11-25T10:00:00.000-0500")],
      runs: [
        { id: 100, event: "workflow_dispatch", status: "in_progress" },
        { id: 101, event: "repository_dispatch", status: "pending" },
      ],
    });
    const out = await run(url);
    expect(dispatches).toEqual([]);
    expect(out).toContain("continues the queue");
  });

  it("ignores finished runs and comment runs", async () => {
    const { url, dispatches } = await setup({
      issues: [issue("HSA-2", "2026-11-25T10:00:00.000-0500")],
      runs: [
        { id: 90, event: "workflow_dispatch", status: "completed" },
        { id: 91, event: "issue_comment", status: "in_progress" },
      ],
    });
    await run(url);
    expect(dispatches).toHaveLength(1);
  });

  it("prints the dispatch and sends nothing in a dry run", async () => {
    const { url, dispatches } = await setup({ issues: [issue("HSA-2", "2026-11-25T10:00:00.000-0500")] });
    const out = await run(url, { DRY_RUN: "true" });
    expect(dispatches).toEqual([]);
    expect(out).toContain('"ticket":"HSA-2"');
  });
});
