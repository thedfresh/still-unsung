# Wikilinks in guide text

Guide and research text (the Field Guide, Deep Dives, song commentary, notes) is written in
Markdown. A wikilink in double brackets names an archive entity. The site renders it as a
formatted link to that entity's page. Decided by the user on 2026-11-16, so that content written
now needs no rework.

## Syntax

| You write | Renders as |
|---|---|
| `[[1990-11-16]]` | The date in the site's date style, linked to the show. |
| `[[1978-10-14 late]]` | The late show on that date. Use `early` or `late` when a date has two shows. |
| `[[1978-10]]`, `[[1978]]` | A partial date ("October 1978", "1978"), linked when exactly one show matches. |
| `[[song:Ripple]]` | The song title, linked to the song page. |
| `[[album:Tiger Rose]]` | The album title, linked to the album page. |
| `[[1990-11-16\|that night in Philadelphia]]` | Your own words, linked to the show. |

- Dates need no prefix. Every other entity needs a type prefix, so a song and an album with the
  same name cannot collide.
- `|` adds your own link text to any wikilink.
- Single brackets keep their normal Markdown meaning. Do not use `[1990-11-16]` for a show.
- Planned types: `song`, `album`, `source` (see External links). Later types (for example `venue`, `musician`, `lyric`) are
  added only when their data model exists. Lyrics wait on the lyrics model (data-model session).
- An unknown type renders as plain text, so text written early never breaks.
- Bear also uses `[[…]]` for links between notes. Drafts in Bear show these as links to missing
  notes; the text is not changed.

## External links

- **Plain Markdown links are allowed:** `[Whitegum's notes](https://…)`. Keep writing them.
- **They are tracked automatically.** When a text is saved, every external link goes into an index:
  the URL, the link text, and the text it came from. The index feeds:
  - a scheduled link-rot check, which lists URLs that now fail and shows a Wayback Machine copy
    where one exists;
  - reports, for example "which guides cite Whitegum".
- **Frequently used sites become source records (decided 2026-11-16).** A site we cite often, such
  as Whitegum, gets one source record with a short key (`whitegum`), its name, credit and license.
  Its page for each song (or show, venue, and so on) is stored once, on that entity, as a locator
  that points to the source record. Nobody looks up or types the URL again, and a changed URL is
  fixed in one place.
- **Source wikilinks** (`source:` is reserved until the Source model exists, HSA-28):

  | You write | Renders as |
  |---|---|
  | `[[source:whitegum]]` | The source's name, linked to its home page. |
  | `[[source:whitegum/Ripple]]` | "Ripple (Whitegum)", linked straight to Whitegum's Ripple page, through the locator stored on the song. |
  | `[[source:whitegum/Ripple\|Alex Allan's notes]]` | Your own words, same link. |

  The part after `/` names the entity the same way as other wikilinks; a date names a show
  (`[[source:etree/1990-11-16]]`). A missing locator renders as plain text and shows in the
  broken-link check, so the gap gets filled once, on the entity.
- **Text that only mentions the song** writes `[[song:Ripple]]`; the song page shows its Whitegum
  link with the other sources.
- **Until the Source model exists,** write plain Markdown links. Already known: the old app's
  `local-data/parsed-data/whitegum-manual-review.json` matches songs to their Whitegum pages, so
  those locators can be loaded at import.
- **Moving to source records:** when the Source model lands, the link index shows the URLs used
  most. Those become source records, and a script proposes rewriting their links to source
  wikilinks, for the user to review.

## Rendering rules

- **Resolve at render time.** The link is looked up in the database each time the page is built,
  through the current slug. A changed slug or a merged entity is followed automatically. The
  stored text is never rewritten.
- **One date formatter.** Dates use the shared date and uncertainty component from the design pass
  (HSA-34). Partial and uncertain dates render the same way as everywhere else on the site. The
  date style is decided there, not here.
- **Two shows on one date, no `early` or `late`:** link to the first show of the date, and flag the
  link as ambiguous.
- **A date with no show** (a birthday, a release date): render the formatted date with no link, and
  list it in the check below.
- **Not found:** render the text without a link. Signed-in admins see a "not found" marker.
- **Render on the server,** as part of the page HTML (see `docs/seo-and-ai-discoverability.md`).

## Checks and backlinks

- **Broken-link check:** a script or admin view lists every wikilink that is not found, ambiguous,
  or a date without a show, with the text it came from.
- **Backlinks:** store which texts mention each entity. An entity page can then list "Mentioned in"
  with links to the guides. The table that holds them is a data-model decision (HSA-28).

## Where it gets built

With the first page that renders guide text, from the page tickets that the parity checklist
drafts (HSA-36). It is a Markdown plugin plus a resolver in the data layer, not a separate ticket.
