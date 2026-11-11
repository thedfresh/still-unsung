# Claude agent workflow

`.github/workflows/claude-agent.yml` runs Claude on GitHub Actions in two ways:

- **Work a Jira ticket.** Start it by hand from the Actions tab ("Claude agent" → *Run workflow*,
  enter a key like `HSA-42`), or, once the Jira trigger exists (HSA-25), automatically when a
  ticket moves to Ready. Claude checks the ticket is Ready and assigned to Claude, moves it to
  In Progress, does the work on branch `hsa-<n>` with tests, commits, pushes the branch and opens
  the PR (`scripts/open-pr.mjs`). Then a second short Claude step moves the ticket to In Review
  with the PR link. Pushing and opening the PR happen inside Claude's step because the action
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
