// Writes the Jira MCP config for an agent run (signs in as the Jira user Claude).
// Used by both jobs in .github/workflows/claude-agent.yml.
//
// Needs: JIRA_EMAIL, JIRA_TOKEN (from repo secrets), AGENT_TMP (output folder).
// Writes $AGENT_TMP/mcp.json and prints a short fingerprint of the credentials (not the secret),
// to compare with the planning repo's .env when Jira rejects the login.
import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";

const { JIRA_EMAIL, JIRA_TOKEN, AGENT_TMP } = process.env;
if (!JIRA_EMAIL || !JIRA_TOKEN || !AGENT_TMP) {
  console.error("write-jira-mcp-config: JIRA_EMAIL, JIRA_TOKEN and AGENT_TMP must be set");
  process.exit(1);
}

// Trim stray whitespace, newlines and quotes from pasted secrets (as the local helper does).
const clean = (value) => value.trim().replace(/^["']|["']$/g, "").replace(/[\r\n ]/g, "");
const pair = `${clean(JIRA_EMAIL)}:${clean(JIRA_TOKEN)}`;
console.log(`Jira credential fingerprint: ${createHash("sha256").update(pair).digest("hex").slice(0, 8)}`);

const encoded = Buffer.from(pair).toString("base64");
const config = {
  mcpServers: {
    jira: {
      type: "http",
      url: "https://mcp.atlassian.com/v2/mcp",
      headers: { Authorization: `Basic ${encoded}` },
    },
  },
};
const json = JSON.stringify(config);
mkdirSync(AGENT_TMP, { recursive: true });
writeFileSync(`${AGENT_TMP}/mcp.json`, json);

// The "respond" job also needs the config as inline JSON. In that job the action adds its own
// inline MCP config, and it keeps only inline JSON when it merges several --mcp-config values:
// a file path is dropped without a warning. So the job passes $JIRA_MCP_CONFIG inline.
// Mask the encoded login first, so it never shows in the log.
if (process.env.GITHUB_ENV) {
  console.log(`::add-mask::${encoded}`);
  appendFileSync(process.env.GITHUB_ENV, `JIRA_MCP_CONFIG=${json}\n`);
}
