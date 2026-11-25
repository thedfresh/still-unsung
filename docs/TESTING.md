# Testing

What each test layer is for, where it lives, and when a change needs it. Read this before you
write a test. To change a rule, change this file in its own pull request.

Use the cheapest layer that proves the change. Slow end-to-end tests are the last choice, not the
default.

## 1. The layers

| Layer | Purpose | Location | Runner | Command |
|---|---|---|---|---|
| Unit | Pure logic: helpers, schemas, formatters. No database, no network. | Next to the source, as `*.test.ts` | Vitest, project `unit` | `npm run test:unit` |
| Database | Code that reads or writes data: the data layer, migrations, constraints. | `tests/db/` | Vitest, project `db` | `npm run test:db` |
| End-to-end | A page or route in a real browser: load, accessibility, widths, cache behavior. | `tests/e2e/` | Playwright and axe | `npm run test:e2e` |
| UI component | Not built yet. See section 2. | — | — | — |

`npm test` runs the unit tests, then the database tests. CI and `npm run check` run it, so they
keep the same coverage. `npm run test:e2e` runs on its own, after `npm run build`.

### Which layer a change needs

| Change | Required test |
|---|---|
| A helper, a Zod schema, a formatter, any pure function | Unit |
| The data layer, a query, a migration, a constraint | Database |
| A Server Action or API route | Database (it calls the data layer). Add e2e only for what the browser sees. |
| A new page | End-to-end: load, axe, and no sideways scroll at phone, tablet and desktop widths |
| A new cached public page | End-to-end: the stale-data case (`docs/CONVENTIONS.md`, section 5) |
| An operations route such as `/api/health` | End-to-end: its response shape is a contract |
| A bug fix | A test that fails before the fix, at the cheapest layer that can show the bug |

A change may need more than one layer. A test at a lower layer does not replace one the table
requires at a higher layer.

### Unit tests

- Colocate: `foo.ts` has `foo.test.ts` in the same folder. Do not add a `tests/unit/` folder.
  Test-only helpers shared by several layers live in `tests/support/`, with their own colocated
  tests.
- A unit test must run without Postgres and without a `.env` file. It does not import the data
  layer or the database client.

### Database tests

- Run against the real test database. Never mock Prisma or the data layer.
- The test setup reads `.env.test` (not `.env`). A value already in the environment wins, which
  is how CI sets its throwaway database.
- Test files run one after the other, because they share one database.

### End-to-end tests

- Run against the production build (`npm run build` first).
- Use them only for what needs a browser. Logic that a unit or database test can prove does not
  belong here.

## 2. UI component tests: not now

There is no component test layer. The first stateful client component (one with state, effects or
browser events) brings the layer and its first test, in the same pull request. That pull request
also adds the runner setup and a row in the table in section 1.

Until then, server components and static pages get end-to-end coverage only.

## 3. Mock rule

**Mock only outside services. Never mock our own database or our own code.**

- **Our database:** tests that touch data use the real test database, `still_unsung_test`
  locally and the throwaway Postgres container in CI. Reset it between tests: delete the rows the
  test made, or truncate the tables in `beforeEach`.
- **Outside services** (Google sign-in, DO Spaces, the error tracker): each gets one shared fake,
  at the edge, in `tests/support/`. Build the fake with the first test that needs it. Do not
  write a new fake per test.
  - Sign-in: fake only Google's reply. Our own session and role checks run for real, with a
    seeded test user.
- **Time and random values:** freezing the clock and fixing random values is allowed. It controls
  inputs. It does not fake behavior.
- **Failure paths:** use a real failure where practical. For "database down", point the client at
  a closed port such as `127.0.0.1:1`.
- **Our own code:** no `vi.mock` of a module in `src/`. If a unit is hard to test without a mock,
  split out the pure part and test that.

## 4. The test database and its guard

- **No test connects to staging or prod.**
- Locally, database tests use their own setting. Copy `.env.test.example` to `.env.test`. The
  file is git-ignored. `.env` points at the dev database, and tests never read it.
- Create the database once, then apply the migrations to it:

  ```bash
  psql -p 5433 -d postgres -c "create database still_unsung_test owner still_unsung;"
  npm run db:deploy:test
  ```

- A guard (`tests/support/assert-test-database.ts`, called from `tests/db/setup.ts`) stops the run
  unless the database name ends in `_test`. It fails with a message that names the database.
- New database tests must not remove the guard or read the database address any other way.

## 5. Synthetic test data

Test data is synthetic: never copy production rows into a test, a seed or a fixture.

- **Factories** build rows for database tests: one `buildEvent()`-style function per entity,
  in `tests/support/factories/`, with sensible defaults and an overrides argument. A factory
  creates the row through the real database client. Build the first factory with the first
  test that needs one.
- **Fixtures** (plain objects in the test file) are enough for unit tests of pure functions.
- Use obviously fake names and values: "Test Venue", dates such as 1999-01-02. Make unique values
  (slugs, emails) from a counter, so reruns do not collide.
