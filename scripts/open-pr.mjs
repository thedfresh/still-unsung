// Opens the pull request for a Claude agent ticket run. Claude runs this as its last action,
// inside the claude-code-action step, while the Claude GitHub App's token (GH_TOKEN) is live.
// The action withdraws that token when the step ends, so a later workflow step can't do this.
//
// Needs: GH_TOKEN, GITHUB_REPOSITORY, BRANCH, TICKET, AGENT_TMP (all set by the workflow).
// Reads the PR description from $AGENT_TMP/pr-body.md and writes the PR URL to $AGENT_TMP/pr-url.
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const { GH_TOKEN, GITHUB_REPOSITORY, BRANCH, TICKET, AGENT_TMP } = process.env;
for (const [name, value] of Object.entries({ GH_TOKEN, GITHUB_REPOSITORY, BRANCH, TICKET, AGENT_TMP })) {
  if (!value) {
    console.error(`open-pr: ${name} is not set`);
    process.exit(1);
  }
}

const subject = execFileSync("git", ["log", "-1", "--format=%s"], { encoding: "utf8" }).trim();
const bodyFile = `${AGENT_TMP}/pr-body.md`;
const body = existsSync(bodyFile)
  ? readFileSync(bodyFile, "utf8")
  : `Work for ${TICKET}.\n\nRefs: ${TICKET}\n`;

const response = await fetch(`https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls`, {
  method: "POST",
  headers: {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${GH_TOKEN}`,
    "X-GitHub-Api-Version": "2022-11-28",
  },
  body: JSON.stringify({ base: "main", head: BRANCH, title: `${TICKET}: ${subject}`, body }),
});

const data = await response.json();
if (!response.ok) {
  console.error(`open-pr: GitHub returned ${response.status}: ${data.message ?? "unknown error"}`);
  for (const error of data.errors ?? []) console.error(`  ${error.message ?? JSON.stringify(error)}`);
  process.exit(1);
}

writeFileSync(`${AGENT_TMP}/pr-url`, data.html_url);
console.log(`Opened ${data.html_url}`);
