# Claude agent workflow

`.github/workflows/claude-agent.yml` runs Claude on GitHub Actions in two ways:

- **Work a Jira ticket.** Starts automatically when a ticket assigned to Claude moves to Ready
  (the Jira rule below), or by hand from the Actions tab ("Claude agent" → *Run workflow*, enter
  a key like `HSA-42`). The run starts within seconds; the ticket moves to In Progress about a
  minute and a half later, once setup is done. Claude checks the ticket is Ready and assigned to Claude, moves it to
  In Progress, does the work on branch `hsa-<n>` with tests, commits, pushes the branch and opens
  the PR (`scripts/open-pr.mjs`). Then a second short Claude step moves the ticket to In Review
  with the PR link. A ticket finished without code goes to In Review with a comment
  saying what was done; one that needs a decision stays In Progress with Claude's question. Pushing and opening the PR happen inside Claude's step because the action
  withdraws the Claude GitHub App's token when that step ends.
- **Answer `@claude` on a pull request.** Comment `@claude` with a request on a PR; Claude
  pushes fixes to that PR's branch. Only people with write access to the repo can trigger it.

Claude never pushes to `main`, never merges, never deploys and never touches the production
database. Branch protection on `main` enforces the first two.

## One-time setup

### 1. Install the Claude GitHub App on this repository

Install the [Claude GitHub App](https://github.com/apps/claude) and give it access to
`still-unsung` only. Pushes and PRs then come from the app (shown as a bot), and CI runs on them.

### 2. Add the repository secrets

Settings → Secrets and variables → Actions → *New repository secret*:

| Secret | What it is | How to get it |
|---|---|---|
| `CLAUDE_CODE_OAUTH_TOKEN` | Runs Claude on your Claude subscription (no API bill) | Run `claude setup-token` in a terminal and copy the token it prints |
| `JIRA_CLAUDE_EMAIL` | The Jira user *Claude*'s email | Same value as `JIRA_CLAUDE_EMAIL` in the planning repo's `.env` |
| `JIRA_MCP_CLAUDE_TOKEN` | The Jira user *Claude*'s MCP token | Same value as `JIRA_MCP_CLAUDE_TOKEN` in the planning repo's `.env` |
| `REFERENCE_REPO_TOKEN` | Read-only access to the private planning repo, its `planning` branch checked out to `/tmp/reference` | A fine-grained personal access token: repository access *only* `hunter-setlist-archive`, permission *Contents: Read-only*, nothing else |

Secrets are never shown in logs and are not available to pull requests from forks.

### 3. Try it on a test ticket

Create a small ticket assigned to Claude, move it to Ready, then run the workflow by hand with
its key. Expect: the ticket moves to In Progress, a branch `hsa-<n>`, a PR opened by the app with
CI green, and the ticket in In Review with the PR link.

### Choosing the model

Runs use Sonnet unless the ticket says otherwise. Add a label to the ticket before moving it to
Ready:

| Label | Model | For |
|---|---|---|
| (none) | Sonnet | Most tickets |
| `opus` | Opus | Hard problems: tricky logic, wide changes, design-heavy work |
| `fable` | Fable | The hardest, most complex tasks |

`fable` wins if both are set. Bigger models use up the Claude subscription's limits faster. Runs
started by hand pick the model on the *Run workflow* form. Each run's report shows the model used.
Jira prints the labels as a comma-separated list; `{{issue.labels.join(",")}}` is rejected as invalid JSON by the rule editor.
A ticket Sonnet can't handle usually comes back as a question on the ticket: add the label and
move it to Ready again.

### 4. The Jira trigger (HSA-25)

A Jira Automation rule in the Hunter Setlist Archive space, named
`Ready for Claude → start agent run`:

- **Trigger:** Work item transitioned, to status **Ready** (from any status).
- **Condition:** Assignee equals the Jira user Claude (shown as "Claude Code").
- **Action:** Send web request
  - URL `https://api.github.com/repos/thedfresh/still-unsung/dispatches`, method POST
  - Body (custom data):
    `{"event_type": "jira-ticket-ready", "client_payload": {"ticket": "{{issue.key}}", "labels": "{{issue.labels}}"}}`
  - Headers: `Authorization: Bearer <token>` (hidden), `Accept: application/vnd.github+json`,
    `X-GitHub-Api-Version: 2022-11-28`, `Content-Type: application/json`
  - Waits for the response, so the rule's audit log shows GitHub's answer (204 means accepted).

The token is a fine-grained personal access token named `jira-trigger-still-unsung`: repository
`still-unsung` only, *Contents: Read and write* (what GitHub requires for a dispatch). It lives
only in the Jira rule. When it expires the trigger stops; make a new one and paste it into the
rule's Authorization header. Runs started this way show the token's owner as the actor; the
pushes, PRs and Jira changes inside the run still come from Claude.

If a move to Ready starts nothing, check the rule's audit log first: no entry means the rule
didn't fire; an error on *Send web request* shows GitHub's reply.

### Creating tickets

Claude may create Jira tickets, but only when the ticket it works asks for them (for example, a
checklist ticket that drafts follow-up tickets). New tickets are Tasks under the right epic,
assigned to Claude or to the user, and stay in To Do; only the user moves a ticket to Ready, so a
created ticket never starts a run by itself. The API puts new tickets in the backlog: use
"Move to board" on the ones to keep. The hand-back lists every ticket created.

### Hand-back format

Every Jira hand-back comment and PR description starts with a five-line executive summary
(Question, What I did, What I found, What changed, Next step for you), written in plain,
short sentences with ASD-STE100 as the guide. The full rules live in the planning repo's
`CLAUDE.md` → *Writing style*; the workflow prompt restates them, so keep the two in step.

Jira is the only channel to the user. Claude tags the user (a Jira mention) in exactly two kinds
of comment: the hand-back when a ticket reaches In Review, and a question that needs a decision.
The user's account ID comes from the repo variable `JIRA_USER_ACCOUNT_ID` (Settings → Secrets and
variables → Actions → Variables), so it isn't written in this public repo. A failed run sends no
message; GitHub emails the person who started it.

## Notes

- The Jira token works only through Atlassian's MCP server, not the REST API, so every Jira
  change in a run is made by Claude through MCP.
- The planning repo is checked out from its `planning` branch to `/tmp/reference`, outside the project,
  so the build, linter and tests never see it and it can't be committed. It is private. Planning
  commits go on that branch (its `main` deploys the old app).
- One ticket run at a time; a second request waits for the first.
- Changes to `claude-agent.yml` can't be fully tested from a branch: the Claude GitHub App only
  issues its token when the workflow file matches `main`'s copy (a safety rule), so a `--ref`
  run tests everything up to the Claude step, which then fails on purpose. Test the rest after merge.
- Runs use the same container image as CI (see README → CI), so setup takes about a minute.
- "Manual run by <you>" in the Actions list means the run was started with your GitHub sign-in
  (from the Actions tab or `gh` on your machine). Pushes and PRs inside the run still come from
  the Claude GitHub App. The Jira trigger (HSA-25) should start runs with the app's identity.
