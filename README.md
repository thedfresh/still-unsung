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
psql -p 5433 -d postgres -c "create role still_unsung login password 'still_unsung' createdb;" -c "create database still_unsung_dev owner still_unsung;"
```

Then install, configure and migrate:

```bash
npm install
cp .env.example .env
npm run db:migrate
npx playwright install chromium
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on http://localhost:3000 |
| `npm run build` | Type check, lint, then production build. Any type error or lint warning fails it |
| `npm run start` | Serve the production build |
| `npm test` | Unit tests and the database round-trip test (needs `DATABASE_URL`) |
| `npm run test:e2e` | Playwright smoke and accessibility tests against the production build (run `npm run build` first) |
| `npm run check` | Everything above, in order |
| `npm run db:migrate` | Create and apply a migration locally (Prisma Migrate) |
| `npm run db:deploy` | Apply pending migrations (staging and prod) |

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs on every pull request and every push to `main`:
install, apply migrations to a throwaway Postgres 18, `npm run build`, `npm test`, then the
Playwright and accessibility tests. A failing step fails the check; once branch protection is on,
a red check blocks merging. On failure the Playwright traces are attached to the run.

## Health check

`GET /api/health` reports `{"status":"ok","checks":{"database":"ok"}}` with HTTP 200, or HTTP 503
when the database is unreachable. Deploys use it to decide when to switch traffic.

## Rules

- Schema changes go through Prisma Migrate only, never `prisma db push` against staging or prod.
  Keep changes additive so deploys stay zero-downtime.
- No production data, secrets or private research material in this repo: it is public.
  Test data is synthetic.
- Every page must pass WCAG 2.2 AA (axe) and work at phone, tablet and desktop widths.
