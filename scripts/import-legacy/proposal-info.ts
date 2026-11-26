import type { ProposalName } from "./context.ts";

// The summary at the top of each review list: what the list is and what a decision on a row
// looks like (migration plan, section 5). Plain text, no data.

export const PROPOSAL_INFO: Record<ProposalName, { what: string; decision: string }> = {
  "01-bill": {
    what: "Shows whose notes or billing field may name other acts on the bill.",
    decision: "Make bill rows for the acts named, or leave the text as a note.",
  },
  "02-uncertain-songs": {
    what: "Songs the old data flags as uncertain.",
    decision: "Choose one: no work, a working title, or a guess at a named work.",
  },
  "03-banter-summaries": {
    what: "Spoken segments from the old banter rows, with their text.",
    decision: "Mark the segment as a summary, or keep the text as the words as heard.",
  },
  "04-typed-footnotes": {
    what: "Performance notes with words that match a footnote type: portion, instrumental or lead-in.",
    decision: "Read the note. If the type is right, set that fact on the segment. If not, leave the note.",
  },
  "05-variant-songs": {
    what: "Songs the old data lists as a variant of a parent song.",
    decision: "Choose one: one version of one work, or two separate works.",
  },
  "06-person-merges": {
    what: "People whose names match once spelling is ignored, or that near-match Robert Hunter.",
    decision: "Merge the people, or keep them apart.",
  },
  "07-place-merges": {
    what: "Places whose names differ only in spelling.",
    decision: "Merge the places, or keep them apart.",
  },
  "08-credit-splits": {
    what: "Credit text the script could not split into names.",
    decision: "Give the names in the text, one credit for each.",
  },
  "09-suite-parts": {
    what: "Suites with a fixed structure that need their parts in order.",
    decision: "Give the parts of the suite in their canonical order.",
  },
  "10-incomplete-setlists": {
    what: "Sets the old data marks as partial, with a suggested reason.",
    decision: "Set the reason the setlist is incomplete: assumed, inferred from the tape or reported.",
  },
  "11-instrumental-works": {
    what: "Songs the old data marks as instrumental.",
    decision: "Confirm the work is an instrumental, or keep it a song.",
  },
  "12-best-known-versions": {
    what: "Songs with an original-artist note.",
    decision: "Turn the note into a best-known version, or leave the note.",
  },
  "13-a-cappella": {
    what: "Notes that mention a cappella.",
    decision: "Read the note. If it describes this segment, set the delivery to a cappella. If not, leave it.",
  },
  "14-guests-in-notes": {
    what: "Notes that may name guest musicians.",
    decision: "Read the note. Add a lineup entry for each guest it names, or leave the note.",
  },
  "15-old-uncertain-flags": {
    what: "Records the old data flagged as uncertain. The import set the matching certainty to possible.",
    decision: "Raise the certainty to probable, or move a show's doubt to its date or place.",
  },
  "16-musical-fragments": {
    what: "Segments the old data flags as musical fragments.",
    decision: "Set the extent to fragment, or leave it as it is.",
  },
  "17-interview-show-types": {
    what: "Interview shows.",
    decision: "Set the show type to Interview or to Broadcast.",
  },
  "18-quotes-and-teases": {
    what: "Notes that mention a quote or a tease of another song (item 64).",
    decision: "Read the note. Make a segment for a song performed, or a quote reference for words quoted inside a lyric.",
  },
  "19-reported-not-on-tape": {
    what: "Notes that say a song was reportedly played or is not on the tape (item 97).",
    decision: "Make a segment with possible certainty, set the reason the setlist is incomplete, or leave the note.",
  },
  "20-hunter-does-not-play": {
    what: "Notes that say Hunter does not play on a song.",
    decision: "Add a lineup entry for Hunter, marked absent, on the segment, or leave the note.",
  },
  "21-from-an-album": {
    what: "Notes that say a song is from an album.",
    decision: "Link the work to the album source, or leave the note.",
  },
};
