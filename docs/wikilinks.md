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
- Planned types: `song`, `album`. Reserved: `source` (see External links). Later types (for example `venue`, `musician`, `lyric`) are
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
- **Citations use a source wikilink, later.** `source:` is reserved. When the Source model exists
  (data-model session, HSA-28), a citation points to one shared source record, so the URL, credit,
  license and saved copy live in one place. The exact form waits on that design.
- **Per-entity links live on the entity.** The Whitegum lyrics page for a song is stored on that
  song, pointing to one "Whitegum" source record. Text that mentions the song writes
  `[[song:Ripple]]`; the song page shows the Whitegum link.
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
