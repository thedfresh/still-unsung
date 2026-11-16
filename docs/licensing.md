# Licensing

How the archive licenses its own work, and how it handles material that belongs to others.
Decided by the user on 2026-11-16 (HSA-136). This is a project policy, not legal advice.

## The rule

- **Everything the archive owns is under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).**
  That covers the data (events, sets, performances, dates, musicians, venues) and our own text
  (notes, guides, summaries, research pages). Anyone may reuse it if they credit the archive.
  Version 4.0 also covers the EU database right.
- **Except the logo and the site name.** They identify the archive. They are not under the open
  license, so a copy of the site cannot present itself as the archive.
- **Third-party material keeps its own license.** It is never under CC BY 4.0 unless its owner
  chose that license. Each item shows its own credit line and license.
- **Unknown license means not public.** An item whose license or permission is unknown stays
  private until its rights are cleared.
- The site-wide statement reads "CC BY 4.0, except where noted". It appears in the footer, in the
  "Cite this page" block, on the Credits and rights page, and as `license` in the structured data.

## Material the archive does not own

| Material | Rule |
|---|---|
| Images by others | Show the creator, the source link and the license, as the license requires. |
| Hunter's lyrics | Owned by their publisher. Quote short passages only, with a credit line. Never under CC BY. |
| Hunter's journals and other writings | Owned by his estate. Keep the archive copies private. Quote short passages with a citation. |
| Recordings | Credit the taper and the source. Link or embed only; follow the host's terms (for example the Live Music Archive). |
| Quoted sources (books, articles, interviews, posts) | Short quotes with a citation. The quote is excepted from CC BY; our text around it is not. |
| Private reference archive items | Private by default. An item becomes public only when its license or permission is recorded. |

## Current site media (checked 2026-11-16, old repo `public/images/`)

| File | Owner | License | Use |
|---|---|---|---|
| `hunter-1980s.png` | David Saddler, [Flickr](https://www.flickr.com/photos/80502454@N00/2118101391/) | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) | Home page photo. The old site already credits it correctly; keep that credit. |
| `still-unsung-logo.png` | The archive | Not open (logo) | Site header. |
| `title-wide.png`, `title-stacked.png` | The archive | Not open (site name, as lettering) | Home page title. |
| `og-default.png` | The archive | Not open (site name, as lettering) | Social preview image. |
| `title.png` | The archive | Not open | Not referenced by the old app; drop it unless needed. |

- The title lettering uses a decorative display font. Confirm that the font's license allows its
  use in a logo and images (many free fonts are free for personal use only).
- The body font, Inter, is under the SIL Open Font License. No action.
- The old app has no other hosted media. Recordings are links (YouTube, Live Music Archive). The
  Live Music Archive player embed is commented out.

## Contributions

When outside contributions open (HSA-130), contributors agree to license what they submit under
CC BY 4.0. Without that agreement the archive cannot publish their submissions under its license.
Material a contributor does not own follows the third-party rules above.

## Removal requests

The Credits and rights page tells a rights holder how to ask for removal: the contact address,
what to include (the page, the item, and proof of ownership), and how fast we reply. Material under
a removal request is hidden while we check it.

## Where this applies

- **Data model (HSA-28):** license fields on images and archive items (license code such as
  `CC-BY-2.0`, license URL, rights holder, credit line, source URL; an empty license means
  unknown). Rows the archive owns need no license field.
- **Public pages and SEO (HSA-39):** footer statement, cite block, `license` in the structured data,
  credit lines from one shared component (design pass, HSA-34).
- **Data export and public API (HSA-124):** ship under CC BY 4.0 with attribution text, and leave
  out every third-party item.
- **Lyrics and writings (HSA-111, HSA-120, HSA-126, HSA-127):** excepted, as above.
- **Images and media (HSA-41, HSA-104, HSA-123):** record the license when an item is collected.
- **Site copy (HSA-47, HSA-57, HSA-58, HSA-106):** CC BY 4.0; quotes inside are excepted.
- **Branding (HSA-50, HSA-53):** the logo and the site-name lettering are not open.
