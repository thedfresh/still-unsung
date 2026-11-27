/**
 * The editable lists the admin maintains (data-model item 91). One entry per list. The generic
 * list page reads its model, labels and fields from here, so a new list is one new entry.
 * Plain data only: the server and the browser both import it.
 */

export type ListFieldKind = "text" | "boolean" | "select";

export interface ListField {
  /** The column name in the schema. */
  name: string;
  label: string;
  kind: ListFieldKind;
  /** A required text field cannot be empty. An optional one saves empty as "not set". */
  required?: boolean;
  /** The values of a select field. */
  options?: readonly string[];
  /** The value of a new boolean field. */
  default?: boolean;
  /** Shown but never edited: code depends on the value (for example `ReferenceKind.ruleKey`). */
  readOnly?: boolean;
  help?: string;
}

export interface ListConfig {
  /** The URL part: `/admin/lists/<slug>`. */
  slug: string;
  /** The model name in `prisma/schema.prisma`. */
  type: string;
  /** Singular and plural, in words, for headings and messages. */
  label: string;
  plural: string;
  /** What the list is for, one sentence. */
  purpose: string;
  /** The fields, name first. */
  fields: readonly ListField[];
}

const NAME: ListField = { name: "name", label: "Name", kind: "text", required: true };

export const LIST_CONFIGS: readonly ListConfig[] = [
  {
    slug: "work-kinds",
    type: "WorkKind",
    label: "work kind",
    plural: "Work kinds",
    purpose: "The kind of a work. A ticked kind counts in the song counts by default.",
    fields: [NAME, { name: "tickedByDefault", label: "Ticked by default", kind: "boolean", default: false }],
  },
  {
    slug: "set-types",
    type: "SetType",
    label: "set type",
    plural: "Set types",
    purpose: "The type of a set in a show. The display name may be empty for the show's one main set.",
    fields: [
      NAME,
      { name: "displayName", label: "Display name", kind: "text" },
      { name: "includeInStats", label: "Include in stats", kind: "boolean", default: true },
    ],
  },
  {
    slug: "show-types",
    type: "ShowType",
    label: "show type",
    plural: "Show types",
    purpose: "The type of a show: public performance, studio session, broadcast and so on.",
    fields: [NAME, { name: "includeInStats", label: "Include in stats", kind: "boolean", default: true }],
  },
  {
    slug: "show-group-kinds",
    type: "ShowGroupKind",
    label: "show-group kind",
    plural: "Show-group kinds",
    purpose: "The kind of a group of shows: festival, tour, run, residency.",
    fields: [NAME],
  },
  {
    slug: "credit-roles",
    type: "CreditRole",
    label: "credit role",
    plural: "Credit roles",
    purpose: "What a person did for a work: words, music, arrangement, translation.",
    fields: [NAME],
  },
  {
    slug: "reference-kinds",
    type: "ReferenceKind",
    label: "reference kind",
    plural: "Reference kinds",
    purpose: "How one record refers to another: quotes, alludes to, part of.",
    fields: [
      NAME,
      { name: "ruleKey", label: "Rule key", kind: "text", readOnly: true, help: "Code reads this key. It cannot change here." },
    ],
  },
  {
    slug: "link-systems",
    type: "LinkSystem",
    label: "link system",
    plural: "Link systems",
    purpose: "A website that holds records about ours. The URL template makes the address from an ID.",
    fields: [
      NAME,
      { name: "purpose", label: "Purpose", kind: "select", required: true, options: ["LISTEN", "WATCH", "READ", "IDENTIFY"] },
      { name: "urlTemplate", label: "URL template", kind: "text", help: "For example https://doi.org/{value}" },
    ],
  },
  {
    slug: "recording-types",
    type: "RecordingType",
    label: "recording type",
    plural: "Recording types",
    purpose: "The type of a recording: soundboard, FM, matrix, video, audience.",
    fields: [NAME, { name: "description", label: "Description", kind: "text" }],
  },
  {
    slug: "instruments",
    type: "Instrument",
    label: "instrument",
    plural: "Instruments",
    purpose: "The instruments a person plays in a lineup.",
    fields: [NAME, { name: "displayName", label: "Display name", kind: "text", required: true }],
  },
  {
    slug: "place-kinds",
    type: "PlaceKind",
    label: "place kind",
    plural: "Place kinds",
    purpose: "The kind of a place: stage, hall, campus, park, city, region, country.",
    fields: [NAME],
  },
  {
    slug: "source-kinds",
    type: "SourceKind",
    label: "source kind",
    plural: "Source kinds",
    purpose: "The kind of a source: ticket, poster, review, tape list, album, book.",
    fields: [NAME],
  },
  {
    slug: "subject-kinds",
    type: "SubjectKind",
    label: "subject kind",
    plural: "Subject kinds",
    purpose: "The kind of a subject: theme, place, character, song form, event of the day.",
    fields: [NAME, { name: "description", label: "Description", kind: "text" }],
  },
  {
    slug: "evidence-kinds",
    type: "EvidenceKind",
    label: "evidence kind",
    plural: "Evidence kinds",
    purpose: "What a version of a work rests on: studio, live and lasting, published text.",
    fields: [NAME],
  },
  {
    slug: "incomplete-reasons",
    type: "IncompleteReason",
    label: "incomplete reason",
    plural: "Incomplete reasons",
    purpose: "Why a set is not complete: assumed, inferred from the tape, reported.",
    fields: [NAME],
  },
];

/**
 * Editable list models that have no admin page, with the reason. Empty today. A list model must
 * have a config above or an entry here: a test checks it, so a new list cannot be forgotten.
 */
export const NO_PAGE_LISTS: Readonly<Record<string, string>> = {};

export function listConfigBySlug(slug: string): ListConfig | undefined {
  return LIST_CONFIGS.find((config) => config.slug === slug);
}
