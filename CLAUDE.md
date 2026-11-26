# CLAUDE.md

Guidance for Claude Code and other coding agents working in this repository. This repository is
public: everything here is visible to anyone. Rules that concern the maintainer's own accounts,
schedules or private material live outside this repo (see *Local and private rules* below).

@AGENTS.md

## Where things live

| what | where |
|---|---|
| Setup, commands, CI | `README.md` |
| How code is written here, and how each rule is enforced | `docs/CONVENTIONS.md` |
| The agent workflow (Jira ticket → run → pull request), review and rework | the private planning repository, `docs/agent-workflow.md` (`/tmp/reference/docs/` in agent runs) |
| Task status | Jira (key `HSA`); a pull request links its ticket with `Refs: HSA-<n>` |

Read `docs/CONVENTIONS.md` before you change code. The build enforces part of it (type check and
lint fail `npm run build`); review enforces the rest.

## Working rules

- Work on a branch, never on `main`. `main` changes only through a pull request with a passing
  "Build and test" check.
- Before you open or update a pull request, run `npm run build` and `npm test`, and
  `npm run test:e2e` when pages change. All must pass.
- Commit messages end with `Refs: HSA-<n>` when the work belongs to a ticket.
- Schema changes go through Prisma Migrate only, following `docs/CONVENTIONS.md` → *Database and
  migrations*.
- **Public repository: no private material.** Never commit production data, secrets, tokens,
  personal details, or private research material. Test data is synthetic.
- Do not edit `.github/workflows/` from an agent run; the Claude GitHub App cannot push workflow
  changes. Say what to change in the pull request instead.

## Writing style

Use **ASD-STE100 (Simplified Technical English)** as a general reference for docs, comments,
commit messages and pull request descriptions. Aim for about 80% compliance: a guide, not a strict
rule set.

- Short sentences: procedures ≤20 words, descriptions ≤25 words. One idea per sentence.
- Active voice and simple tenses. Use the imperative for instructions.
- One word, one meaning. Keep a term consistent once used. Use the schema's words: "show" for a
  whole performance event, "set" for a part of a show, "segment" for one piece of a show in order
  (a song, a fragment, stage talk), "work" for what was written. "Event" and "performance" are
  the old app's names; use them only when you mean the old data.
- Do not omit articles ("the", "a"). Avoid stacked noun clusters of more than three words.
- Use lists for steps and for more than two parallel items.
- **A pull request description starts with an executive summary** of five labeled lines, one or
  two plain sentences each: **Question** (what we wanted to fix, and why it matters),
  **What I did**, **What I found** (at most two key numbers), **What changed** (by content, not by
  commit), **Next step for you** (the one action needed). No ticket keys, file names or commit ids
  in the summary; details follow it.

The agent workflow's prompt restates these rules; keep the two in step.

## Local and private rules

The maintainer's Jira workflow, contact rules and operational notes are not in this repository.

- **Interactive sessions on the maintainer's machine** load them from `CLAUDE.local.md`, which is
  git-ignored and imports the private planning repository's rules.
- **Agent runs in GitHub Actions** check out the private planning repository read-only to
  `/tmp/reference` and read `/tmp/reference/CLAUDE.md`.

If neither is available to you, follow only the rules in this file.

**Docs in this repository are about the code only** (this file, the README, `docs/CONVENTIONS.md`,
`docs/TESTING.md`). This repository is public. Specs, policies, research, designs, decision logs
and runbooks go in the private planning repository's `docs/`, never here.
