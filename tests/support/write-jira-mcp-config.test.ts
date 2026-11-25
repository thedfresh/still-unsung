import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(process.cwd(), "scripts", "write-jira-mcp-config.mjs");

function run(env: Record<string, string>) {
  return execFileSync("node", [script], {
    env: { ...process.env, JIRA_EMAIL: "", JIRA_TOKEN: "", AGENT_TMP: "", GITHUB_ENV: "", ...env },
    encoding: "utf8",
  });
}

describe("write-jira-mcp-config", () => {
  it("writes the config file and the inline copy for the GitHub env file", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-config-"));
    const envFile = join(dir, "github-env");
    writeFileSync(envFile, "");
    const out = run({
      JIRA_EMAIL: "agent@example.test",
      JIRA_TOKEN: "synthetic-token",
      AGENT_TMP: join(dir, "agent"),
      GITHUB_ENV: envFile,
    });

    const fromFile = readFileSync(join(dir, "agent", "mcp.json"), "utf8");
    const encoded = Buffer.from("agent@example.test:synthetic-token").toString("base64");
    expect(JSON.parse(fromFile).mcpServers.jira.headers.Authorization).toBe(`Basic ${encoded}`);
    expect(out).toContain(`::add-mask::${encoded}`);
    expect(readFileSync(envFile, "utf8")).toBe(`JIRA_MCP_CONFIG=${fromFile}\n`);
    // The inline copy sits inside single quotes in the workflow, so it holds none.
    expect(fromFile).not.toContain("'");
  });

  it("still works outside GitHub Actions", () => {
    const dir = mkdtempSync(join(tmpdir(), "mcp-config-"));
    run({ JIRA_EMAIL: "a@example.test", JIRA_TOKEN: "t", AGENT_TMP: dir });
    expect(JSON.parse(readFileSync(join(dir, "mcp.json"), "utf8")).mcpServers.jira.type).toBe("http");
  });
});
