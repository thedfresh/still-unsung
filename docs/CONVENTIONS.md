# Engineering conventions

How we write code in this repository. Every change follows these rules; a reviewer may send back
a change that breaks one. To change a rule, change this file in its own pull request.

Each rule says how it is enforced: **build** (type check or lint fails `npm run build`),
**test** (a test fails), or **review** (a person or agent checks it in the pull request).

Rules marked *built with its first user* describe code that does not exist yet. The first
ticket that needs it builds it once, in the place named here.

Sign-in, roles and headers are in section 10. The wider security review (HSA-135) may add more.

The app runs as one process. During a deploy the old and the new process overlap for a few
seconds, and each has its own cache. A second long-running process would first need a shared
cache handler.

## 1. Where code goes

| Folder | What goes there |
|---|---|
| `src/app/` | Routes only: pages, layouts, route handlers, Server Actions. Keep them thin. |
| `src/lib/data/` | The data access layer: one file per entity, all Prisma reads and writes. |
| `src/lib/validation/` | Zod schemas for input, shared by forms, Server Actions and API routes. |
| `src/lib/` (other files) | Shared helpers: errors, IDs, dates, slugs, cache tags, formatters. |
| `src/components/ui/` | Shared UI components, used by public pages and admin. |
| `src/components/admin/` | Admin-only components. |
| `tests/e2e/` | Playwright and axe tests. |
| `tests/db/` | Tests that need a real database. |
| `tests/support/` | Shared test helpers: the test-database guard, fakes, factories. |

- Unit tests sit next to their source as `*.test.ts`. (test: Vitest finds them) Test layers,
  mocks and test data: [TESTING.md](TESTING.md).
- File names are kebab-case: `event-card.tsx`, `sort-date.ts`. Components export PascalCase
  names. (build: `eslint-plugin-check-file` for file names; review for the exports)
- Import with the `@/` alias, not long relative paths (more than one `../`).
  (build: ESLint `no-restricted-imports`)
- App code (pages, components, Server Actions, routes) never imports anything from Prisma: not
  the client, not the generated types, not the error classes. It calls the data layer instead.
  Only `src/lib/data/` does, together with `src/lib/db.ts`, the client factory the data layer
  uses. (build: ESLint `no-restricted-imports`)
- Seeds, `tests/db/` and scripts are not app code and may use Prisma directly.

## 2. Server components, Server Actions and API routes

| Need | Use |
|---|---|
| Show data on a page | A server component that calls the data layer. Never `fetch` our own API. |
| Change data from the admin | A Server Action, through `defineAction` (section 4). |
| Data for another program (scripts, a future public API, LLM tools) | An API route under `/api/v1/`, through `defineRoute` (section 4). |
| Operations (health check, cache refresh after a changeset) | An unversioned route under `/api/`, for example `/api/health`. |

- Components are server components by default. Add `"use client"` only to the small leaf that
  needs state, effects or browser APIs. (review)
- Never pass a whole database row to a client component. Pass only the fields it shows. (review)
- The admin has no JSON API of its own. Its forms call Server Actions. (review)

### API versioning

- Every API route for other programs lives under `/api/v1/`. (review)
- Inside a version, make only additive changes: new routes, new optional fields. (review)
- A breaking change (a removed or renamed field, a new meaning) goes to `/api/v2/`. Keep `v1`
  working until nothing calls it. (review)
- Operations routes have no version. Their response shape is a contract with the deploy, and
  the e2e tests check it. (test)

## 3. Input validation and errors

### Validation

- Validate all input with Zod at the edge: route params, query strings, request bodies, form
  data and Server Action arguments. Code behind the edge receives typed, valid values. (review)
- Put a schema that a form and an action share in `src/lib/validation/`. (review)
- Parse database IDs with `parseId` or `idSchema` from `src/lib/ids.ts`. Never call `Number()`
  or `parseInt()` on an ID by hand. (test covers the helper; review)
- A bad ID in a URL path is a 404 (`not_found`). A bad ID in a body or form is a 400
  (`invalid_input`). (review)

### One error shape

Every API route and Server Action reports errors with the same shape, from `src/lib/errors.ts`:

```json
{ "error": { "code": "not_found", "message": "Not found.", "fields": { "title": ["Enter a title."] } } }
```

| `code` | HTTP status | When |
|---|---|---|
| `invalid_input` | 400 | The input failed validation. `fields` lists the problems per field. |
| `unauthorized` | 401 | The user is not signed in. |
| `forbidden` | 403 | The user's role does not allow the action. |
| `not_found` | 404 | The record does not exist or is not public. |
| `conflict` | 409 | A unique value is taken, or the record changed since the form loaded. |
| `rate_limited` | 429 | Too many sign-in attempts or wrong token checks from one client. |
| `internal` | 500 | Anything else. |

- Throw `AppError(code, message?)` for an expected failure. Its message is fixed, safe text.
  (review)
- The data layer maps Prisma errors to `AppError` codes: a unique-constraint error becomes
  `conflict`, a missing record becomes `not_found`. `src/lib/errors.ts` never knows about
  Prisma, and no code outside the data layer sees a Prisma error. (build: the Prisma import
  rule in section 1; review for the mapping)
- **Edit conflicts.** `conflict` for "the record changed since the form loaded" has one
  mechanism. Every editable record has an `updatedAt` column that Prisma sets on each write.
  The edit form carries the `updatedAt` it loaded, as a hidden field. The data layer writes
  only if `updatedAt` still matches. If no row changes, it raises `conflict`, and the form says
  the record changed since it was opened. `defineAction`, `useEntityForm` and the data layer
  build this in once. (test: a database test with the first editable entity; review until
  then.) Adding `updatedAt` to every table is also a data-model design requirement (HSA-28,
  HSA-35).
- Never send `error.message`, a Prisma error, SQL or a stack trace to the client. `toErrorBody`
  logs unknown errors on the server and returns only "Something went wrong." (test)
- The health check is the one exception: it keeps the shape the deploy reads. (test)

## 4. Shared patterns

These come from the old app's lessons. There, the same code was copied into dozens of routes,
forms and list pages, and each copy drifted.

- **`defineAction` (Server Actions)** — built in `src/lib/actions.ts` (HSA-33), except the cache-tag refresh and the `updatedAt` check, which the first cached editable entity adds.
  It takes a Zod schema, the required role, the data-layer call and the cache tags to refresh.
  It validates, checks the role, runs the call, refreshes the tags and returns
  `{ ok: true, data }` or `{ ok: false, error }` in the shape from section 3. It also builds in
  the `updatedAt` edit-conflict check. Every admin mutation goes through it. (review)
- **`defineRoute` (API routes)** — built in `src/lib/api.ts` (HSA-33), except Zod parsing of input, which the first route with input adds. The same
  steps for route handlers: parse params, query and body with Zod, check the role, set
  `Cache-Control`, map errors with `toErrorBody`. (review)
- **`useEntityForm` (admin forms)** — *built with its first user*, in `src/lib/use-entity-form.ts`.
  One form hook on top of React's `useActionState`. It carries the hidden `updatedAt` field and
  shows the conflict message. It shows field errors from `fields`, keeps
  the input after an error and marks the form as busy while it saves. No admin form writes its
  own save logic. (review)
- **Config-driven admin lists** — *built with its first user*, in
  `src/components/admin/admin-list.tsx`. One list component; each entity gives it a config:
  columns, filters, default sort and the data-layer call. No hand-written list pages. (review)

### Domain helpers, built once

Each helper lives in one file in `src/lib/`, has unit tests and is the only way to do its job.
They are *built with their first user*, after the data model (HSA-28, HSA-35) settles the
fields. (review)

- **Slugs** (`src/lib/slugs.ts`): one `slugify` for every entity, and one way to resolve a
  collision that relies on the database's unique index. Public pages never compute slugs; they
  read the stored slug. A changed slug keeps a redirect from the old one.
- **Sort dates** (`src/lib/sort-date.ts`): the stored sort key is always computed by this
  helper from the partial date, the show timing and the slug number. Never compute it in a
  route or a form. The sort key is internal: it may use placeholder values to get the order
  right, and it is never shown or treated as a real date. The order is:
  - A year-only date sorts before every dated show that year. A year and month sorts before the
    dated shows in that month.
  - Several year-only shows in one year keep a fixed order, set by the number in the slug.
    The same holds for several year-and-month shows in one month.
  - Shows on the same day: if both have a start time, compare start times. Otherwise compare
    the labels: no label, then early, then late. If still tied, the show with a start time
    goes first.
- **Partial dates** (`src/lib/partial-date.ts`): a date may have a year only, a year and month,
  or a full date. One type, one Zod schema and one formatter for display. Never fill a missing
  month or day with 1 in a stored or displayed date. (The sort key above is the one place a
  placeholder is allowed.)
- **Three-state booleans** (`src/lib/tri-state.ts`): many flags are `true`, `false` or `null`,
  and `null` means "not known". Store them as nullable columns with no default. Validate with
  `z.boolean().nullable()`. Edit them with a three-option control (Yes, No, Not known), never a
  checkbox. Never coerce `null`: no `?? false`, `!!value` or `Boolean(value)` on these fields.

## 5. Caching and revalidation

The old app showed stale pages after admin edits. The cause was never fully pinned down: a
proxy cache, missing revalidation calls, or both. The new app has one cache, with explicit rules
and a test.

- The app uses Next.js Cache Components (`cacheComponents: true`). Cache data in the data layer
  with `"use cache"`, always with a `cacheLife` and a `cacheTag`. (review)
- Cache tags come from one module, `src/lib/cache-tags.ts` (*built with its first user*), for
  example `event` for all events and `event:42` for one event. Never write a tag as a string
  literal anywhere else. (build: ESLint `no-restricted-syntax` on `cacheTag`, `updateTag` and
  `revalidateTag` calls)
- Every write refreshes the tags it affects, through `defineAction`. Use `updateTag` in Server
  Actions so the editor sees the change at once. (review)
- **No database content in the build.** The build runs in CI against an empty database, so
  content baked into the build would be wrong. A page that shows database content calls
  `await connection()` (or reads request data) before the cached read. The cache then fills at
  request time. (build: CI runs `npm run build` with a database address that fails on any
  connection, so a page that reads the database at build time breaks the build)
- Writes from outside the app (changesets, the data import) end with a call to a protected
  cache-refresh route. That route is *built with its first user*. It uses
  `revalidateTag(tag, { expire: 0 })`, not `updateTag` (which only works in Server Actions), so
  the cache entry expires at once and the next visitor sees new data. (review)
- The proxy in front of the app (nginx) does not cache pages or API responses. It may cache
  `/_next/static/`, whose file names change with every build. (review of the deploy config)
- API routes set `Cache-Control` themselves: `no-store` unless a route documents otherwise.
  (review)
- **Stale-data test.** The first cached public page brings an e2e test that loads the page,
  changes the record through the admin action, loads the page again and expects the new value.
  Each new cached page adds its case. This test proves that edits show up; it does not check
  the build rule above. (test)

## 6. Database and migrations

- Change the schema only with Prisma Migrate: `npm run db:migrate` locally, `npm run db:deploy`
  on staging and prod. Never `prisma db push` outside a laptop experiment. (review; CI applies
  the migrations from scratch)
"Cutover" is the day the new app takes live traffic from the old app. Two phases follow from it.

- **Before cutover** there is no live traffic, so a change may be done in one step. (review)
- **After cutover** every change is additive, in two steps (expand, then contract). First
  deploy: add the new column or table, and write to both old and new. A later deploy: remove
  the old one. Old and new code run side by side during the zero-downtime switch. (review)
- **Renames.** Before cutover, a plain `RENAME` in the migration is allowed. After cutover, a
  rename follows expand/contract: add the new column, deploy code that writes both, backfill,
  then drop the old column in a later deploy. A plain `RENAME` after cutover needs a planned
  maintenance window that the owner approves. Never drop and add in one migration, which loses
  the data. (review)
- **Backfills.** Before cutover, a backfill may sit in the migration. After cutover: (1) a
  migration adds the column; (2) a deploy ships code that writes old and new values; (3) a
  separate script backfills existing rows in batches; (4) a later deploy drops the old column.
  (review)
- Never edit a migration that is already on `main`. Add a new one. (review)
- Test data is synthetic. Never put production data in a migration, seed or test: nothing in
  the repository holds production data. The data import (the one-time copy of the old
  database) is a script, not a schema migration. It reads production data at run time and
  never stores it in the repository. (review)

## 7. Components, mobile and accessibility

- A file in `src/` has at most 300 lines and a function at most 120, not counting blank lines
  and comments. Split a bigger one into smaller components or helpers. Tests are exempt.
  (build: ESLint `max-lines`, `max-lines-per-function`)
- One component, one job. A page composes sections; a section composes shared UI. (review)
- Design every page at phone width first, then widen it. (review)
- Every page meets WCAG 2.2 AA: keyboard use, visible focus, labels on every form field,
  errors in text, contrast, tap targets of at least 24 by 24 CSS pixels, and nothing shown by
  color alone. (test: axe in the e2e tests; review for the rest)
- Every new page gets e2e tests for load, axe and no sideways scroll at phone, tablet and
  desktop widths, like the home page. (test)

## 8. Performance budgets

Targets for public pages, measured on a phone profile. They become automated checks when the
first public pages exist; a page that misses one needs a reason in its pull request.

- Core Web Vitals "good" at the 75th percentile: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1.
- Server response for a cached page ≤ 200 ms on the droplet.
- A page makes a fixed number of database queries, not one per row (no "N+1" queries).
  (review)
- A list longer than 200 rows paginates or loads in parts. (review)
- Client JavaScript only where it is needed (section 2). (review)

## 9. Checks before a pull request

Run these. All must pass.

```bash
npm run build      # type check, lint (no warnings allowed), production build
npm test           # unit, component, then database tests (needs the test database)
npm run test:e2e   # when pages change
```

`npm run test:unit`, `npm run test:component` and `npm run test:db` run each part alone. Which tests a change needs:
[TESTING.md](TESTING.md).

## 10. Sign-in, roles and security headers

- **One way to read the user.** `getCurrentUser()` (`src/lib/current-user.ts`) returns the
  signed-in user, with the role, from a session or an agent access token. Never call `auth()`
  or read the session cookie anywhere else. (review)
- **Every admin page, action and route checks a role.** A page calls `AdminShell` (it checks
  `ADMIN`). An action uses `defineAction` with `roles`. A route uses `defineRoute` with `roles`.
  (review; tests cover the checks)
- **Sign-up is closed.** Only an email that has a `users` row signs in. Add users in the admin
  or with `npm run db:create-admin`. Auth.js never writes a user (`createClosedAdapter`). (test)
- **Agent tokens.** Only the SHA-256 hash is stored. Only a user with the `AGENT` role has a
  token. A token never acts as `ADMIN` and never opens an admin page. (test)
- **Rate limits** use `src/lib/rate-limit.ts`: sign-in requests and wrong token checks. They
  report `rate_limited` (429). (test)
- **Security headers** come from `next.config.ts` for every route. A strict `script-src` with a
  per-request nonce is not set yet. (test: e2e)
- **No secrets in the repository.** Settings such as `AUTH_SECRET` come from the environment.
  `AUTH_GOOGLE_ISSUER` is for tests only: never set it on staging or prod. (review)

## 11. Agent edits (the MCP server)

An agent writes content only through the app's MCP server at `POST /api/v1/mcp`
(data-model items 16, 19, 40, 42, 87, 89). It never writes to the database directly.

- **Sign-in.** The route accepts only an agent access token (role `AGENT`, `via: "token"`).
  A session never opens it. (test: e2e)
- **Four tools.** `preview_changes` and `apply_changes` write. `get_record` and `search_records`
  read. One general edit tool covers every content table; add a task-specific tool only when a
  job proves clumsy. (review)
- **Which tables.** `src/lib/content-access.ts` decides. The agent never writes users, roles,
  tokens, sessions, changesets, the `entities` table, backlinks or addresses. It never writes an
  editable list (item 91): a preview that needs a new list value stops and names it. It never
  deletes or merges. (test: `tests/db/agent-changes.test.ts`)
- **Zotero fields.** A source may have no Zotero link (item 108). The tools may create a
  source with `title`, `key`, `sourceKindId` and `otherNames`, and change them while it is
  unlinked. They never set `zoteroKey`, `zoteroData` or `syncedAt` (`AGENT_FORBIDDEN_FIELDS`).
  They never change the title of a linked source. (test: `tests/db/agent-changes.test.ts`)
- **Validation is built once.** `src/lib/validation/content.ts` builds the checks for every
  content table from `src/lib/content-model.json`. The admin forms use the same checks. After a
  schema change, run `npm run db:content-model`; a unit test fails while the file is out of date.
  (test)
- **Preview, then apply.** A preview runs the edits for real inside a transaction that it rolls
  back, saves a `PREVIEWED` changeset and returns a one-time token (30 minutes). Apply claims
  the token first, so it works once even when the apply then fails. It re-checks every `rev`
  inside the write. If a record changed, nothing is written and both versions are returned.
  (test)
- **One formatter.** `src/lib/changes/preview-format.ts` writes the preview text. Change the
  wording there only. It shows a field of a new record only when the value differs from the
  column default. `src/lib/changes/labels.ts` and `labelRow` write the record labels, also used
  by the Changes page. A link shows as `ID (name)`, or `(new) Type "name"` for a record made in
  the same call. Public text (a public note body, a segment summary) shows in full; other long
  text is cut. The apply step stores each item's label, so the Changes page runs no label queries.
  (review)
- **Insert by position.** A new segment takes `before` or `after` (a segment ID or a ref)
  instead of `sortKey`. `placeSegment` makes the key between the neighbours. (test)
- **Every write path makes a changeset** (`src/lib/data/changes/`), linked to the user. The admin
  edit screens reuse `writeEdits` and the changeset code with path `ADMIN`. The page
  `/admin/changes` lists each change with who made it, its evidence and its previous state.
- **Not built yet:** the call to the cache-refresh route after an apply (no cached page reads
  content yet; section 5), and undo.
