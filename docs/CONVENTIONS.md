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
- **Place roll-up (HSA-185).** A show is attached to the most specific place known (data-model
  item 36), nearly always a venue. Every count or list of a place's shows, on admin and public
  pages and in filters, includes the places inside it at any depth (venue → city → region →
  country), so a city lists the shows at its venues. Use `countShowsInPlace` in
  `src/lib/data/places.ts` (one recursive query) or the same `WITH RECURSIVE` tree; never
  `_count.shows` on a place alone. Where it helps, also show the shows attached directly.
  (test: `tests/db/places-rollup.test.ts`)
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
- **Sign in before any data read.** An admin page calls `requireAdminPage()` before it reads
  data, and before it awaits anything that reads data. `AdminShell` checks the role too, but it
  renders after the page has loaded its data, so it is too late to protect the read. The
  page's inner component starts with `await requireAdminPage();`. (review; e2e test for a
  signed-out request)
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
- **Import rules come from the server.** The rules are policy, so the text is not in this
  repository. It lives in one private guide page (slug `agent-import-rules`, entity not public).
  The server `instructions` (`MCP_INSTRUCTIONS`, `src/lib/import-rules.ts`) tell a new client to
  call `get_import_rules`, which reads the page on every call and returns the body and `rev`.
  Edit it with an agent `update` on `GuidePage`. `seedImportRulesPage` makes the page with a
  placeholder when it is missing (`npm run db:seed -- --import-rules-only`). Every public read of a
  guide page goes through `src/lib/data/guide-pages.ts`, which leaves out private pages. No public
  reader of guide pages exists yet. Any future one must use those `isPublic` helpers. The page
  refuses an agent edit of `isPublic` or `slug`, and a delete. An agent also cannot create a
  guide page with that slug or rename a page to it. A change to it is always private.
  (test: `tests/db/import-rules.test.ts`, `tests/e2e/agent-mcp.spec.ts`)
- **Import rules admin page.** `/admin/import-rules` shows the page body as formatted text, with
  its `rev`, its last change time and a link to the change that made the last edit. It reads
  through `getImportRulesForAdmin` (`src/lib/data/guide-pages.ts`), which ignores the public
  mark, after `requireAdminPage()`. `MarkdownBody` (`src/components/ui/markdown-body.tsx`)
  renders the markdown in a server component. It never parses raw HTML, and links and images
  show as text. The page is read-only. (test: `tests/db/import-rules-admin.test.ts`,
  `src/components/admin/import-rules-view.test.tsx`, `tests/e2e/agent-mcp.spec.ts`)
- **Five tools.** `preview_changes` and `apply_changes` write. `get_record`, `search_records`
  and `get_import_rules` read. One general edit tool covers every content table; add a task-specific tool only when a
  job proves clumsy. (review)
- **Which tables.** `src/lib/content-access.ts` decides. The agent never writes users, roles,
  tokens, sessions, changesets, the `entities` table, backlinks or addresses. It may create a
  value in an editable list (items 91, 116) with `op: "create"`, and a ref in the same call may
  use it. It never updates or deletes a list value: the refusal says "Ask the user to change
  list values in the admin". A fixed list (an enum) is not a table and is never written. It
  never merges. (test: `tests/db/agent-changes.test.ts`, `src/lib/content-access.test.ts`)
- **Edit ops.** An edit is `create`, `update` or `delete`. A delete is
  `{ op: "delete", type, id, rev }`. `rev` is required for a type that has a version number and
  must be left out for one that has none (for example `NoteAttachment`). It follows the same
  rules as the other ops: a stale `rev` refuses the call, a preview comes first, one call is one
  changeset. `ChangesetItem.before` keeps the full row and `after` is null. The record's
  `entities` row goes in the same transaction. Deletes run after the creates and updates of the
  call, so a call can move the attachments of a record and then delete it. A delete waits for the
  deletes of the records that point at it (`orderDeletes`), so the order given does not matter.
  A source, recording or person that is the evidence of a change is refused with "It is the
  evidence for N changes and cannot be deleted"; a call that deletes its own evidence is refused
  at preview.
  A record that still has anything attached (citations, notes, references, external IDs, or
  children such as the segments of a set) is refused with a plain message that names the count
  and the first few records. The database `ON DELETE` rules are a last guard, never the check.
  (`findAttached` in `write-edits.ts`; test: `tests/db/agent-changes.test.ts`)
- **Credit for one passage (item 123).** A `Credit` may have a `passageId`. Then it must also have
  a `workId`, and the passage must belong to that work. `checkCreditPassage` (`write-edits.ts`)
  refuses any other case, for a create and for an update. A passage that has credits cannot move
  to another work (`checkPassageMove`). (test: `tests/db/credit-passage.test.ts`)
- **Zotero fields.** A source may have no Zotero link (item 108). The tools may create a
  source with `title`, `key`, `sourceKindId` and `otherNames`, and change them while it is
  unlinked. They never set `zoteroKey`, `zoteroData` or `syncedAt` (`AGENT_FORBIDDEN_FIELDS`).
  They never change the title of a linked source. (test: `tests/db/agent-changes.test.ts`)
- **Private show archive.** `Show.legacyData` holds the old site's archive of a show. Only the
  legacy import writes it. The tools refuse it (`AGENT_FORBIDDEN_FIELDS`), and no public read
  selects it. (test: `src/lib/validation/content.test.ts`, `tests/db/import-legacy.test.ts`)
- **Validation is built once.** `src/lib/validation/content.ts` builds the checks for every
  content table from `src/lib/content-model.json`. The admin forms use the same checks. After a
  schema change, run `npm run db:content-model`; a unit test fails while the file is out of date.
  (test)
- **Preview, then apply.** A preview runs the edits for real inside a transaction that it rolls
  back, saves a `PREVIEWED` changeset and returns a one-time token (30 minutes). Apply claims
  the token first, so it works once even when the apply then fails. It re-checks every `rev`
  inside the write. If a record changed, nothing is written and both versions are returned.
  (test)
- **One readout.** `src/lib/changes/readout.ts` words a set of changes, for the preview and for
  the Changes page. Change the wording there only. `src/lib/changes/preview-format.ts` adds only
  the warnings, the evidence and the apply token. The readout has the counts first, then the
  unusual lines (new people, places, works, bands, subjects and sources; a value changed from
  one value to another; certainty below CONFIRMED; every delete, as "Deleted · <record name>"
  with its key fields from `before`; new list values, such as "New subject kind: brand"), then one heading per parent (show, work,
  person) with one plain line per record. It never prints raw flags or system fields: it says
  who can see a record in words. It shows a field of a new record only when the value differs
  from the column default. `src/lib/changes/labels.ts` and `labelRow` write the record labels.
  Each record is a card: a title line, then its fields as a list. A changed text or value reads
  on two lines (`was:` and `now:`), cut at about 100 characters. A link shows the name only, never
  the ID, or `(new) Type "name"` for a record made in the same call. An ID shows only when
  there is no name: `(deleted record N)` when the record is gone, `(record N, name not found)`
  otherwise. Private text shows like any other text, because only the admin and the agent see
  the readout (a public change log, later, shows summaries only). `isPrivateText` lists the
  fields that the schema marks PRIVATE, and the readout puts "(private)" after their names: words
  as heard, a citation excerpt, a private note body, and the `wording` of a rendition, version
  passage or variant passage. It cuts private text at about 100 characters, like other text. A
  private note is titled by the start of its body, with "(private)" after it. A cut ends with
  one "…" character. A card says "Moved" only for a change of parent or order (`MOVE_FIELDS`
  in the readout, including `Segment.parentId`). `Credit.versionId` is the credited subject, so
  a change to it reads "Changed".
  `describeItems` (`src/lib/data/changes/describe.ts`) finds the names and the parent. It caches
  each lookup per call (one key per set). The preview and the apply step run it inside a
  transaction with a 30-second limit. The apply step stores the names with each item (`label`, `detail`), so the
  Changes page runs no label queries for new changes. For a change stored before that, the page
  runs one batched lookup per record type (`src/lib/data/changes/earlier.ts`).
  (test: `src/lib/changes/readout.test.ts`, `tests/db/agent-changes.test.ts`)
- **Insert by position.** A new segment takes `before` or `after` (a segment ID or a ref)
  instead of `sortKey`. `placeSegment` makes the key between the neighbours. (test)
- **Every write path makes a changeset** (`src/lib/data/changes/`), linked to the user. The admin
  edit screens reuse `writeEdits` and the changeset code with path `ADMIN`. The page
  `/admin/changes` is a log, newest first, 50 to a page: one line for each change (the counts
  sentence, who made it, its evidence and the time). Opening a line shows the readout.
- **Pending preview page.** `/admin/changes/pending/[id]` shows an open preview as cards, with
  the shared `ReadoutView` (`src/components/admin/readout-view.tsx`). `/admin/changes/pending`
  lists the open previews, newest first, each with its stored counts. The changeset keeps only
  the edits, so `getPendingPreview` (`src/lib/data/changes/pending.ts`) runs the same trial as the
  preview in a transaction that rolls back, then describes the items. It never writes. An
  expired, used or applied preview says so and is not rebuilt. A card links to its show page when
  the record sits in a show. `preview_changes` ends its text with the page address, built from
  `AUTH_URL` (`src/lib/changes/preview-link.ts`); with no `AUTH_URL` it adds no link. The proxy
  gives an unknown ID a real 404. When the stored plan no longer fits the database (a record
  changed, gone or taken), the page shows the message as a warning, not an error. An applied
  change links to the page of the Changes log that lists it. The page does not apply or discard.
  (test: `tests/db/pending-preview.test.ts`, `tests/e2e/agent-mcp.spec.ts`)
- **Not built yet:** the call to the cache-refresh route after an apply (no cached page reads
  content yet; section 5), undo, and merge.

## 12. Admin edit forms and the shared save

Every admin edit screen saves through one path, so an admin edit and an agent edit are the same
kind of change (data-model items 19, 42, 87, 102, 109).

- **One server function.** `saveAdminChanges` (`src/lib/data/changes/admin-save.ts`) takes
  `{ edits, evidence, isPublic? }`. The edits have the shape of the MCP tool: `{ op, type, id?,
  rev?, ref?, before?, after?, fields }`. It checks the role `ADMIN`, then runs the same
  `previewChanges` and `applyChanges` as the MCP server, in one step, with path `ADMIN`. One save
  is one changeset. It has no write logic of its own. (test: `tests/db/admin-save.test.ts`)
- **One Server Action.** `saveAdminChangesAction` (`src/app/admin/save-action.ts`) wraps it with
  `defineAction`. A form calls this action, never its own. (review)
- **Result.** `{ status: "saved" }`, `{ status: "conflict" }` (a record changed: both versions,
  nothing written) or `{ status: "blocked" }` (for example a missing list value). Both refusals
  carry plain `messages`. A bad edit or a wrong role comes back in the error shape of section 3.
  A form never shows a database error. (test)
- **Form pattern.**
  1. The page reads the record with its `rev` and passes `rev` to the form as a prop.
  2. The form keeps its draft in React state. It sends the `rev` it was given with each update.
  3. The form calls `useAdminSave(saveAdminChangesAction)`
     (`src/components/admin/use-admin-save.ts`). The hook gives `pending`, `messages`,
     `conflicts` and `save`. Disable Save and show "Saving…" while `pending` is true. Show
     `messages` in a `role="alert"` region. Show both versions of a conflict. Keep the draft
     after an error.
  4. After a save the hook refreshes the page. The new `rev` arrives as a prop. The form closes
     when its `rev` changes (see `summary-editor.tsx`).
  5. Count text fields that have a limit, for example "12 of 300 characters".
- **Evidence picker.** `EvidencePicker` (`src/components/admin/evidence-picker.tsx`) is part of
  every edit form. A save always names its evidence once. "My own knowledge" is the default.
  `recentEvidence(userId)` gives the five latest choices of the user, one click each. The
  picker also takes a source, recording or contributor by ID, with a page or time. `evidenceOf`
  (`src/lib/evidence-choice.ts`) turns the choice into the `evidence` of the save.
- **The public mark** keeps the changeset default (`defaultPublicMark`). A form does not set it
  yet.
- **Editable lists** (`/admin/lists`, `/admin/lists/[list]`, HSA-165). One generic page, driven by
  `LIST_CONFIGS` in `src/lib/lists/config.ts`: the model, the labels and the fields of each list.
  A new list is one new entry. A unit test fails for a list model with no entry and not named in
  `NO_PAGE_LISTS`. `src/lib/lists/edits.ts` builds the edits (add, update, delete, move) and
  `src/lib/data/lists.ts` reads the values with how many records use each. Every change is one
  `saveAdminChanges` call with the evidence picked once on the page. A move swaps the `position`
  of two neighbours. A value in use shows "In use by N records" and no delete control; the delete
  is also refused by the data layer. A field that code reads (`ReferenceKind.ruleKey`) is
  read-only. Only the ADMIN path may update or delete a list value: `parseEdits` and
  `writeRefusal` take the path, and the MCP tools keep refusing it (section 11). Fixed lists
  (enums) have no page. (test: `src/lib/lists/*.test.ts`, `tests/db/admin-lists.test.ts`,
  `tests/e2e/admin-lists.spec.ts`)
- **Admin pages and navigation** (HSA-178). `src/lib/admin-nav.ts` lists every admin page once;
  the navigation bar and the admin home both read it, so a new page is one new entry. The home
  page shows the five latest changes. Every admin page, old and new, has this shape: the default
  export is a `Suspense` around an inner component, and the inner component starts with
  `await requireAdminPage();` before it awaits anything that reads data (section 10). The users
  and tokens pages follow it too. Each page has a signed-out e2e test that checks the raw
  response holds no record data. (test: `tests/e2e/admin-v1.spec.ts`, `admin-lists.spec.ts`)
- **Catalogue lists** (works, people, bands, places). One generic page,
  `src/app/admin/[kind]/page.tsx`, driven by `src/lib/entity-lists.ts` and
  `src/lib/data/entity-lists.ts`: a search box, a sort and 50 rows to a page. Name sorts ignore
  leading punctuation and a leading "The", "A" and "An" (`sortName` in `src/lib/sort-name.ts`; the sort runs in code on the
  matching names, because no column holds the folded form). Each row links to a read-only record
  page, `src/app/admin/[kind]/[id]/page.tsx`, which may show private fields. The shows list has
  its own page because it sorts by date, and links the public page when the show has one.
  `src/proxy.ts` gives an unknown record ID a real 404.
- **The show editor** (`/admin/shows/[id]/edit`). The page reads the show once through
  `getShowEditData` (`src/lib/data/shows/edit.ts`: a fixed number of queries) and passes plain
  values to `ShowEditor` (`src/components/admin/show-editor/`). The page holds one evidence choice
  and one save state. Every part saves through `send`, which calls the shared save, so one click
  or one form is one changeset with the `rev` of each record. The parts are the show fields (a
  partial date from `src/lib/partial-date.ts`, place and place name, band, billed as, status), the
  bill, the sets (add, set type, reorder), the segments (add at the end, after or inside another
  segment; edit work, delivery, extent including aborted, segue, portion note and summary;
  move, nest and unnest) and the show's notes. `src/lib/shows/edit-edits.ts` builds every edit
  as a pure function. A move changes only the moved segment's `sortKey` (and `parentId` for a
  nest). A spoken segment hides extent and portion. A work picker shows each work's variants.
  `RecordPicker` searches by name through `searchPickerAction`, which is read-only and ADMIN only.
  (test: `tests/db/show-editor.test.ts`, `src/lib/shows/edit-edits.test.ts`,
  `tests/e2e/admin-v1.spec.ts`)
- **Not built yet:** undo from the admin (the changeset keeps `before`), deletes from most admin
  screens (the show editor deletes only a bill entry and a note's link), editors for works,
  people, bands and places, lineups, vocals, recordings and citations in the show editor, and
  merging records. The shared save can use the `delete` op later.

## 13. The public read layer

Every public page reads through `src/lib/data/public/` (HSA-177). One rule: a record is public when
its `Entity.isPublic` is true (`visibility.ts`).

- **Explicit selects only.** A public read lists its fields with `select`, never `include`. It
  never selects a private field: `Show.legacyData`, `Segment.wordsAsHeard`, a private note, a
  citation, or the wording of a rendition. (review; test: `tests/db/public-show.test.ts` and
  `tests/e2e/public-show.spec.ts` seed a private value of each kind and search the result and the HTML)
- **A name of a related record** (band, place, work, person) shows only when that record is public
  (`publicName`). A private work gives the row "Title not public".
- **Hidden segments keep the structure.** The layer reads a private segment's order and join mark
  only, so a segue chain stays true across it (`dropWithJoins`). Its children are hidden too.
- **The show page** is `/shows/<slug>`. `src/proxy.ts` gives an unknown or private slug a real 404.
  The setlist views are `?view=standard` (default) and `?view=complete`, plain links.
  The rules for both views live in `src/lib/shows/setlist.ts`.
- **Not cached yet.** The page reads fresh on each request, because nothing refreshes a cache after
  an agent edit (section 5). The first cached public page adds the tags and the stale-data test.
