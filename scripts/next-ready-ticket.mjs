// Starts the next agent run when a ticket run ends (the queue drain).
//
// GitHub keeps only one pending run per concurrency group, so tickets moved to Ready together
// lose their runs: a newer pending run cancels the older one. This script runs as the last step of
// the ticket job in .github/workflows/claude-agent.yml. It finds the oldest Ready ticket assigned
// to Claude and starts one run for it (workflow_dispatch). Each run thus starts the next one.
//
// Rules:
//   - One dispatch at most per run.
//   - It starts nothing when another ticket run is queued or running: that run continues the queue.
//   - It skips the ticket of this run and every ticket in TRIED (earlier runs of this chain), so a
//     ticket that stays Ready after a failed run cannot start a loop. The chain ends at the end of
//     the list.
//
// Needs: JIRA_EMAIL, JIRA_TOKEN, GH_TOKEN, GITHUB_REPOSITORY, TICKET.
// Optional: TRIED (comma-separated keys), GITHUB_RUN_ID, GITHUB_API_URL, JIRA_URL, REF, DRY_RUN=true
// (print the dispatch instead of sending it).
const {
  JIRA_EMAIL,
  JIRA_TOKEN,
  GH_TOKEN,
  GITHUB_REPOSITORY,
  TICKET,
  TRIED = "",
  GITHUB_RUN_ID = "",
  GITHUB_API_URL = "https://api.github.com",
  JIRA_URL = "https://dfresh.atlassian.net",
  REF = "main",
  DRY_RUN = "",
} = process.env;

for (const [name, value] of Object.entries({ JIRA_EMAIL, JIRA_TOKEN, GH_TOKEN, GITHUB_REPOSITORY, TICKET })) {
  if (!value) {
    console.error(`next-ready-ticket: ${name} is not set`);
    process.exit(1);
  }
}

const WORKFLOW_FILE = "claude-agent.yml";
const TICKET_EVENTS = new Set(["workflow_dispatch", "repository_dispatch"]);
const KEY = /^HSA-\d+$/;

const clean = (value) => value.trim().replace(/^["']|["']$/g, "").replace(/[\r\n ]/g, "");
const jiraAuth = `Basic ${Buffer.from(`${clean(JIRA_EMAIL)}:${clean(JIRA_TOKEN)}`).toString("base64")}`;
const githubHeaders = {
  Accept: "application/vnd.github+json",
  Authorization: `Bearer ${GH_TOKEN}`,
  "X-GitHub-Api-Version": "2022-11-28",
};

async function request(url, init, what) {
  const response = await fetch(url, init);
  if (!response.ok) {
    console.error(`next-ready-ticket: ${what} failed: ${response.status} ${await response.text()}`);
    process.exit(1);
  }
  return response.status === 204 ? null : response.json();
}

const keyNumber = (key) => Number(key.slice(key.indexOf("-") + 1));

// 1. Another ticket run that is not finished continues the queue itself.
const runs = await request(
  `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/runs?per_page=50`,
  { headers: githubHeaders },
  "listing workflow runs",
);
const others = (runs.workflow_runs ?? []).filter(
  (run) => TICKET_EVENTS.has(run.event) && run.status !== "completed" && String(run.id) !== GITHUB_RUN_ID,
);
if (others.length > 0) {
  console.log(`Another ticket run is queued or running (run ${others[0].id}). It continues the queue.`);
  process.exit(0);
}

// 2. The Ready tickets assigned to Claude (the Jira login is Claude's, so currentUser() is Claude).
const search = await request(
  `${JIRA_URL}/rest/api/3/search/jql`,
  {
    method: "POST",
    headers: { Authorization: jiraAuth, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({
      jql: "project = HSA AND status = Ready AND assignee = currentUser()",
      fields: ["labels", "statuscategorychangedate"],
      maxResults: 100,
    }),
  },
  "searching Jira",
);

const tried = TRIED.split(",").map((key) => key.trim()).filter((key) => KEY.test(key));
const skip = new Set([...tried, TICKET]);
const candidates = (search.issues ?? [])
  .filter((issue) => !skip.has(issue.key))
  .sort((a, b) => {
    const byTime = Date.parse(a.fields.statuscategorychangedate) - Date.parse(b.fields.statuscategorychangedate);
    return byTime || keyNumber(a.key) - keyNumber(b.key);
  });

if (candidates.length === 0) {
  console.log("No other Ready ticket assigned to Claude. The queue is empty.");
  process.exit(0);
}

// 3. Start one run for the oldest. The label picks the model, as in a Jira-started run.
const next = candidates[0];
const labels = (next.fields.labels ?? []).map((label) => label.toLowerCase());
const model = labels.includes("fable") ? "fable" : labels.includes("opus") ? "opus" : "sonnet";
const inputs = { ticket: next.key, model, tried: [...tried, TICKET].join(",") };

if (DRY_RUN === "true") {
  console.log(`Dry run. Would start a run: ${JSON.stringify(inputs)}`);
  process.exit(0);
}

await request(
  `${GITHUB_API_URL}/repos/${GITHUB_REPOSITORY}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
  {
    method: "POST",
    headers: { ...githubHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: REF, inputs }),
  },
  "starting the next run",
);
console.log(`Started a run for ${next.key} (${model}).`);
