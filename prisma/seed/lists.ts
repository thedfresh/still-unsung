// Starting values for the editable lists (design item 91). The names are generic terms for
// the kinds of things the archive records. Nothing here is production data.

export const workKinds = [
  { name: "song", tickedByDefault: true },
  { name: "instrumental", tickedByDefault: true },
  { name: "poem", tickedByDefault: false },
  { name: "essay", tickedByDefault: false },
  { name: "interview", tickedByDefault: false },
  { name: "episode", tickedByDefault: false },
  { name: "journal entry", tickedByDefault: false },
];

// The type "Set" has an empty display name (item 97): a show's one main set.
export const setTypes = [
  { name: "Set", displayName: "", includeInStats: true },
  { name: "First set", displayName: "First set", includeInStats: true },
  { name: "Second set", displayName: "Second set", includeInStats: true },
  { name: "Encore", displayName: "Encore", includeInStats: true },
  { name: "Soundcheck", displayName: "Soundcheck", includeInStats: false },
];

export const showTypes = [
  { name: "Public performance", includeInStats: true },
  { name: "Studio session", includeInStats: false },
  { name: "Broadcast", includeInStats: true },
];

export const showGroupKinds = ["festival", "tour", "run", "residency", "benefit series"];

export const creditRoles = ["words", "music", "arrangement", "translation"];

// `ruleKey` names the kinds that a rule reads by meaning (items 30, 35, 80, 91).
export const referenceKinds = [
  { name: "quotes", ruleKey: "quotes" },
  { name: "alludes to", ruleKey: null },
  { name: "draws on", ruleKey: null },
  { name: "mentions", ruleKey: null },
  { name: "part of", ruleKey: "part-of" },
  { name: "played on air", ruleKey: "played-on-air" },
  { name: "annotates", ruleKey: null },
  { name: "main subject", ruleKey: null },
];

export const linkSystems = [
  { name: "Internet Archive", purpose: "LISTEN", urlTemplate: "https://archive.org/details/{value}" },
  { name: "YouTube", purpose: "WATCH", urlTemplate: "https://www.youtube.com/watch?v={value}" },
  { name: "DOI", purpose: "READ", urlTemplate: "https://doi.org/{value}" },
  { name: "Wikipedia", purpose: "IDENTIFY", urlTemplate: null },
] as const;

export const recordingTypes = ["SBD", "FM", "Matrix", "Video", "AUD"];

export const instruments = [
  { name: "guitar", displayName: "guitar" },
  { name: "bass", displayName: "bass" },
  { name: "drums", displayName: "drums" },
  { name: "keyboards", displayName: "keyboards" },
  { name: "vocals", displayName: "vocals" },
];

export const placeKinds = ["stage", "hall", "campus", "park", "farm", "village", "city", "region", "country"];

export const sourceKinds = ["ticket", "poster", "advertisement", "review", "tape list", "album", "book", "image"];

export const subjectKinds = [
  { name: "theme" },
  { name: "place" },
  { name: "character" },
  { name: "song form" },
  { name: "event of the day" },
  // Item 110: the curator's judgments. A record is marked by a "part of" reference to one.
  { name: "highlight", description: "The curator's judgments, such as a notable show or an excellent version." },
];

export const incompleteReasons = ["assumed", "inferred from the tape", "reported"];

export const evidenceKinds = ["studio", "live and lasting", "published text"];
