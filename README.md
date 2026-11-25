# still-unsung

Code base for [StillUnsung.com](https://stillunsung.com), the Robert Hunter Performance Archive.

This is the rebuilt app. It is not live yet: the current site still runs from the old codebase
until cutover.

## Stack

| | Version | Notes |
|---|---|---|
| Node | 26 (Active LTS) | Pinned in `.nvmrc` and `engines` |
| Next.js | 16 (App Router, Cache Components) | |
| React | 19 | |
| TypeScript | 5.9 (strict) | TypeScript 7 can't read Next's generated route types yet; move up when Next supports it |
| Prisma | 7 | `prisma-client` generator with the `pg` driver adapter |
| PostgreSQL | 18 | |
| Tailwind CSS | 4 | |
| Zod | 4 | Input validation ([docs/CONVENTIONS.md](docs/CONVENTIONS.md)) |
| Vitest | 5 | Unit and database tests |
| Playwright + axe | 1.65 / 4.14 | Smoke and accessibility tests at phone, tablet and desktop widths |

## Getting started

Prerequisites: Node 26 and PostgreSQL 18. On macOS with Homebrew:

```bash
brew install node@26 postgresql@18
```

Run Postgres 18 on port 5433 so it can sit beside an older Postgres on 5432: set `port = 5433`
in `/opt/homebrew/var/postgresql@18/postgresql.conf`, then start it:

```bash
brew services start postgresql@18
```

Create the local role and databases:

```bash
psql -p 5433 -d postgres -c "create role still_unsung login password 'still_unsung' createdb;" -c "create database still_unsung_dev owner still_unsung;" -c "create database still_unsung_test owner still_unsung;"
```

Then install, configure and migrate:

```bash
npm install
cp .env.example .env
cp .env.test.example .env.test
npm run db:migrate
npm run db:deploy:test
npx playwright install chromium
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Type check, lint, then production build. Any type error or lint warning fails it |
| `npm run start` | Serve the production build |
| `npm test` | Unit, component, then database tests. Same as `npm run test:unit`, `npm run test:component` and `npm run test:db` |
| `npm run test:unit` | Unit tests only. No database needed |
| `npm run test:component` | Client component tests in jsdom. No database needed |
| `npm run test:db` | Database tests, against the test database from `.env.test`. Refuses any database not named `*_test` |
| `npm run test:e2e` | Playwright smoke and accessibility tests against the production build (run `npm run build` first) |
| `npm run check` | Everything above, in order |
| `npm run db:migrate` | Create and apply a migration locally (Prisma Migrate) |
| `npm run db:deploy` | Apply pending migrations (staging and prod) |
| `npm run db:deploy:test` | Apply pending migrations to the test database from `.env.test` |
| `npm run db:seed` | Load the synthetic sample archive into the database from `.env`. It skips a database that already has shows |
| `npm run db:create-admin` | Make the curator's ADMIN user from `CURATOR_EMAIL` in `.env`. Safe to run again. See *Admin sign-in* |
| `npm run db:import-legacy` | Rebuild the database from `.env` out of the restored old database. See *Import from the old database* |

## Data model

The schema in `prisma/schema.prisma` has one `Entity` row for each fact record, and the record shares its id.
Read the comments at the top of the file first. The migration also adds what Prisma cannot express: the
`pg_trgm` extension, check constraints and byte-order sort keys. `tests/db/constraints.test.ts` tests them.
The seed (`prisma/seed/`) holds the starting values for the editable lists and a small invented sample
archive. It contains no production data.

## Admin sign-in

The admin uses Auth.js: sign in with Google or a passkey. The site stores no passwords. Sign-up is
closed: only an email that already has a user row can sign in, and nobody else gets a row.

Set it up on a laptop:

1. Fill in `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` and `CURATOR_EMAIL` in `.env`
   (see `.env.example`). Behind a proxy, also set `AUTH_TRUST_HOST="true"`.
2. Run `npm run db:create-admin`. It makes the ADMIN user from `CURATOR_EMAIL`.
3. Start the app and open `/admin`. Sign in with Google. On the admin home page, add a passkey.

Roles are `ADMIN` and `AGENT` (the `UserRole` enum). Every admin page, action and API route
checks a role. `getCurrentUser()` in `src/lib/current-user.ts` is the one function that returns the
signed-in user, from a session or from an agent access token.

- **Users:** `/admin/users` adds a user (email and role) and removes one.
- **Agent tokens:** `/admin/tokens` makes a token for a user with the `AGENT` role and shows it once.
  The database keeps only its hash. An agent sends `Authorization: Bearer <token>`. A token acts as its
  agent user and never as an admin. Revoke it on the same page. `GET /api/v1/me` shows who a token acts as.
- **Limits and headers:** sign-in requests and wrong token checks are rate limited for each client
  address (the proxy must set `X-Forwarded-For`). Every response carries the security headers
  set in `next.config.ts`.

## Import from the old database

`scripts/import-legacy/` copies the restored old database into the new schema. It follows the
migration plan and never classifies: where a value needs the curator's judgment, it writes the
safe default and adds the case to a proposal file.

Before the run:

1. Restore the dump of the old database into a Postgres database, for example `hunter_archive_old`.
   The script reads it and never writes to it. It never connects to old prod.
2. Copy the settings at the end of `.env.example` into `.env`. Fill in the Zotero keys of the three
   sources (legacy setlist list, GDSets, Whitegum) and the output folder.
3. Put the output folder outside this repository. The proposal files quote old notes.

Run it:

```bash
npm run db:import-legacy
```

Each run **empties** the target database and rebuilds it. The target name must end in `_dev`,
`_test` or `_staging`, and it must not be the old copy. The script refuses any other name.

The run writes these files to the output folder:

- `report.md` and `report.json`: row counts by old and new table, the stress tests, every row that
  did not map with its reason, and the proposal sizes. The report holds ids and counts only.
- `proposals/*.json`: the 17 review lists. The script does not apply them.
- `place-chains.tsv`: the place chain of every show.

The exit code is 1 when the report finds an old row it cannot account for. The tests run the
whole import against a small invented copy of the old tables (`tests/db/import-legacy.test.ts`).

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`:
install, apply migrations to a throwaway Postgres 18, `npm run build`, `npm test`, then the
Playwright and accessibility tests. A failing step fails the check, and a red check blocks merging.
On failure the Playwright traces are attached to the run.

CI and the Claude agent run inside Playwright's container image
(`mcr.microsoft.com/playwright`, tag pinned in both workflows), which already has Node 26, Chromium
and its system libraries, so runs never wait on Ubuntu's package servers. Shared setup steps live
in `.github/actions/setup`, and each step has a time limit so a bad runner fails in minutes.
When `@playwright/test` or the Node version in `.nvmrc` changes, change the image tag to match;
the setup step fails with a clear message if the image's Node and `.nvmrc` disagree.

## Claude agent

`.github/workflows/claude-agent.yml` lets Claude work Jira tickets and answer `@claude` on pull
requests. Setup and how it works: [docs/agent-workflow.md](docs/agent-workflow.md).

## Health check

`GET /api/health` reports `{"status":"ok","version":"0.1.0","checks":{"database":"ok"}}` with HTTP 200, or HTTP 503
when the database is unreachable. `version` is the `version` in `package.json`, so a deploy can confirm
which release is live. Deploys use it to decide when to switch traffic.

## Rules

Test layers, the mock rule and test data: [docs/TESTING.md](docs/TESTING.md).

The full engineering conventions (where code goes, validation and errors, caching, migrations,
component size, performance) are in [docs/CONVENTIONS.md](docs/CONVENTIONS.md). In short:

- Schema changes go through Prisma Migrate only, never `prisma db push` against staging or prod.
  Keep changes additive so deploys stay zero-downtime.
- No production data, secrets or private research material in this repo: it is public.
  Test data is synthetic.
- Every page must pass WCAG 2.2 AA (axe) and work at phone, tablet and desktop widths.
