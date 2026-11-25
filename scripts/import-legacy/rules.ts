// Pure mapping rules of the legacy import (HSA-37). No database, no I/O: each rule is a plain
// function, so a unit test can check it with synthetic values.

/** One row of an old table, as the `pg` driver returns it. */
export type Row = Record<string, unknown>;

export function str(row: Row, key: string): string | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.trim() === "" ? null : text;
}

export function num(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function bool(row: Row, key: string): boolean {
  const value = row[key];
  return value === true || value === 1 || value === "t" || value === "true";
}

export function dateOf(row: Row, key: string): Date | null {
  const value = row[key];
  if (value instanceof Date) return value;
  if (typeof value === "string" && value !== "") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function normalizeName(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** "Bill Gallagher" becomes "bill-gallagher" (item 42). */
export function slugify(text: string): string {
  return normalizeName(text)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ---------------------------------------------------------------------------------------------
// Credits (item 98)

const NOT_A_NAME = /(traditional|trad\.|unknown|anonymous|public domain|various|\d|\bby\b|[()"?])/i;

/**
 * Split credit text into names. Return null when any part does not look like a plain name:
 * the caller then keeps the text and lists the song for review. A wrong split is worse than
 * none (the script never classifies).
 */
export function splitCredit(text: string): string[] | null {
  const parts = text
    .split(/\s*(?:\/|;|&|\+|,|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (NOT_A_NAME.test(part)) return null;
    const words = part.split(/\s+/);
    if (words.length > 4) return null;
    if (words.length === 1 && (part.length < 4 || part.includes("."))) return null;
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------
// Contributor lines (item 102)

export interface ContributorLines {
  /** Ids of the matched contributors, one per line. */
  matched: number[];
  /** Lines that start with "Contributor:" and match no person. They stay in the note. */
  unmatched: number;
  /** The note without the lines that became citations. Null when nothing is left. */
  remaining: string | null;
}

/**
 * Take the lines that start with "Contributor:" out of a note. A line is removed only when its
 * name matches a person (`resolve` returns an id); every other line stays as written.
 */
export function takeContributorLines(
  note: string,
  resolve: (name: string) => number | null,
): ContributorLines {
  const matched: number[] = [];
  let unmatched = 0;
  const kept: string[] = [];
  for (const line of note.split(/\r?\n/)) {
    const found = /^\s*contributors?\s*:\s*(.+?)\s*$/i.exec(line);
    if (!found) {
      kept.push(line);
      continue;
    }
    const id = resolve(found[1]);
    if (id === null) {
      unmatched += 1;
      kept.push(line);
    } else {
      matched.push(id);
    }
  }
  const remaining = kept.join("\n").trim();
  return { matched, unmatched, remaining: remaining === "" ? null : remaining };
}

/** The name after "Contributor:" in a raw legacy entry, or null. */
export function contributorNamedIn(raw: string): string | null {
  const found = /contributors?\s*:\s*([^\r\n]+)/i.exec(raw);
  return found ? found[1].trim() : null;
}

// ---------------------------------------------------------------------------------------------
// Dates (items 57, 93, 95)

const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function dateParts(date: Date | null): { year: number | null; month: number | null; day: number | null } {
  if (!date) return { year: null, month: null, day: null };
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function squash(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** True when the old display date says only what the date parts say (no "as written" needed). */
export function displayDateMatches(
  display: string,
  year: number | null,
  month: number | null,
  day: number | null,
): boolean {
  const target = squash(display);
  const candidates: string[] = [];
  const mm = month === null ? "" : String(month).padStart(2, "0");
  const dd = day === null ? "" : String(day).padStart(2, "0");
  if (year !== null && month !== null && day !== null) {
    const name = MONTHS[month - 1];
    for (const m of [name, name.slice(0, 3)]) {
      candidates.push(`${m}${day}${year}`, `${day}${m}${year}`);
    }
    candidates.push(`${year}${mm}${dd}`, `${month}${day}${year}`, `${mm}${dd}${year}`);
  } else if (year !== null && month !== null) {
    const name = MONTHS[month - 1];
    candidates.push(`${name}${year}`, `${name.slice(0, 3)}${year}`, `${year}${mm}`, `${month}${year}`);
  } else if (year !== null) {
    candidates.push(String(year));
  }
  return candidates.includes(target);
}

export interface TimingInput {
  id: number;
  year: number | null;
  month: number | null;
  day: number | null;
  timing: string | null;
}

export interface TimingResult {
  timeLabel: string | null;
  /** "HH:MM:SS"; "24:00:00" is midnight at the end of the date (user, 2026-11-24). */
  scheduledTime: string | null;
  orderOnDate: number | null;
  /** A lone "Early" or "Late" show: listed in the report (item 95). */
  unpaired: boolean;
  /** The timing text holds digits, but no clock time can be read from it: listed, time left empty. */
  ambiguousTime: boolean;
  /** The date has several shows and their labels or times do not order them: listed. */
  unordered: boolean;
}

/**
 * A clock time in minutes after midnight, or null. A time with no "am" or "pm" is read only
 * when it is plainly a 24-hour time (hour 13 or later): "8:00" alone could be morning or
 * evening, and the script does not guess (item 95).
 */
function clockMinutes(text: string): number | null {
  const lower = text.toLowerCase();
  if (lower.includes("midnight")) return 1440;
  const found = /(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/.exec(lower);
  if (!found || (found[2] === undefined && found[3] === undefined)) return null;
  let hour = Number(found[1]);
  const minute = found[2] === undefined ? 0 : Number(found[2]);
  const suffix = found[3]?.[0];
  if (hour > 24 || minute > 59) return null;
  if (suffix === undefined && hour < 13) return null;
  if (suffix === "p" && hour < 12) hour += 12;
  if (suffix === "a" && hour === 12) hour = 0;
  const total = hour * 60 + minute;
  return total === 0 ? 1440 : total;
}

function timeText(minutes: number): string {
  const hour = Math.floor(minutes / 60);
  return `${String(hour).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}:00`;
}

/**
 * Item 95: "Early" and "Late" become the label as written; clock times become a scheduled
 * time. A date with several shows gets an order only when every show has a label or time that
 * orders it (all early or late, or all clock times, with no ties). Otherwise the order stays
 * empty and the date is listed: the script does not invent an order.
 */
export function assignShowTiming(shows: TimingInput[]): Map<number, TimingResult> {
  const result = new Map<number, TimingResult>();
  const groups = new Map<string, TimingInput[]>();
  for (const show of shows) {
    if (show.year !== null && show.month !== null && show.day !== null) {
      const key = `${show.year}-${show.month}-${show.day}`;
      groups.set(key, [...(groups.get(key) ?? []), show]);
    }
  }
  const parse = (text: string | null) => {
    const lower = (text ?? "").trim().toLowerCase();
    const minutes = lower === "" ? null : clockMinutes(lower);
    return { lower, minutes };
  };
  for (const show of shows) {
    const { lower, minutes } = parse(show.timing);
    let timeLabel: string | null = null;
    if (lower === "early") timeLabel = "Early";
    else if (lower === "late") timeLabel = "Late";
    else if (minutes === 1440) timeLabel = "Midnight";
    else if (lower !== "" && minutes === null) timeLabel = show.timing?.trim() ?? null;
    result.set(show.id, {
      timeLabel,
      scheduledTime: minutes === null ? null : timeText(minutes),
      orderOnDate: null,
      unpaired: false,
      ambiguousTime: lower !== "" && lower !== "early" && lower !== "late" && minutes === null && /\d/.test(lower),
      unordered: false,
    });
  }
  for (const group of groups.values()) {
    if (group.length === 1) {
      const only = result.get(group[0].id);
      const lower = (group[0].timing ?? "").trim().toLowerCase();
      if (only && (lower === "early" || lower === "late")) only.unpaired = true;
      continue;
    }
    // One sort key for each show, or null when its text does not order it.
    const allClock = group.every((show) => parse(show.timing).minutes !== null);
    const allLabels = group.every((show) => ["early", "late"].includes(parse(show.timing).lower));
    const keyOf = (show: TimingInput): number | null => {
      const { lower, minutes } = parse(show.timing);
      if (allClock) return minutes;
      if (allLabels) return lower === "early" ? 1 : 2;
      return null;
    };
    const keys = group.map(keyOf);
    const ordersThem = keys.every((key) => key !== null) && new Set(keys).size === group.length;
    if (!ordersThem) {
      for (const show of group) {
        const entry = result.get(show.id);
        if (entry) entry.unordered = true;
      }
      continue;
    }
    [...group]
      .sort((a, b) => (keyOf(a) as number) - (keyOf(b) as number))
      .forEach((show, index) => {
        const entry = result.get(show.id);
        if (entry) entry.orderOnDate = index + 1;
      });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Segment order (section 8: a fractional-index key)

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * `count` keys in byte order, in the format of the fractional-indexing integer part: "a0"
 * to "az", then "b00" to "bzz". An insert later goes between two keys without a renumber.
 */
export function sortKeys(count: number): string[] {
  if (count > 62 + 62 * 62) throw new Error(`Too many siblings for a sort key: ${count}`);
  const keys: string[] = [];
  for (let i = 0; i < count; i += 1) {
    if (i < 62) keys.push(`a${DIGITS[i]}`);
    else {
      const n = i - 62;
      keys.push(`b${DIGITS[Math.floor(n / 62)]}${DIGITS[n % 62]}`);
    }
  }
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Smaller rules

export type VocalRoleName = "LEAD" | "HARMONY" | "BACKING";

/**
 * The old vocal role is free text. Return a role only when the text names exactly one. Any
 * other text (empty, unknown, or naming two roles) gives "UNKNOWN": the caller reports the row
 * and does not guess a role (items 33 and 83).
 */
export function vocalRoleOf(text: string | null): VocalRoleName | "UNKNOWN" {
  const lower = (text ?? "").toLowerCase();
  // Item 33: the old default value "default" means a lead singer.
  if (lower.trim() === "default") return "LEAD";
  const found: VocalRoleName[] = [];
  if (/lead/.test(lower)) found.push("LEAD");
  if (/harm/.test(lower)) found.push("HARMONY");
  if (/back/.test(lower)) found.push("BACKING");
  return found.length === 1 ? found[0] : "UNKNOWN";
}

export function isUnknownName(name: string): boolean {
  return normalizeName(name) === "unknown";
}

export const SUITES = [
  { match: "alligator moon", title: "Alligator Moon", structure: "FIXED" },
  { match: "terrapin", title: "Terrapin", structure: "VARIABLE" },
  { match: "eagle mall", title: "Eagle Mall", structure: "FIXED" },
] as const;

/** The suite a tag names (item 35), or null. Dylan and Beatles tags are dropped elsewhere. */
export function suiteForTag(tagName: string): (typeof SUITES)[number] | null {
  const lower = normalizeName(tagName);
  return SUITES.find((suite) => lower.includes(suite.match)) ?? null;
}

export function isDroppedTag(tagName: string): boolean {
  return /dylan|beatles/i.test(tagName);
}

export function findUrls(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s<>)\]"']+/gi)].map((m) => m[0].replace(/[.,;]+$/, ""));
}

export function sameSet<T>(a: Iterable<T>, b: Iterable<T>): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return left.size === right.size && [...left].every((x) => right.has(x));
}

export type Purpose = "LISTEN" | "WATCH" | "READ" | "IDENTIFY";

export interface LinkTarget {
  system: string;
  purpose: Purpose;
}

/** Link systems of plan section 3, with the purpose each one serves (item 54). */
export const LINK_SYSTEMS: Array<LinkTarget & { urlTemplate: string | null }> = [
  { system: "Live Music Archive", purpose: "LISTEN", urlTemplate: "https://archive.org/details/{value}" },
  { system: "EtreeDB", purpose: "IDENTIFY", urlTemplate: "https://db.etree.org/shn/{value}" },
  { system: "Lossless Legs", purpose: "LISTEN", urlTemplate: null },
  { system: "SHN", purpose: "LISTEN", urlTemplate: null },
  { system: "YouTube", purpose: "WATCH", urlTemplate: "https://www.youtube.com/watch?v={value}" },
  { system: "Vimeo", purpose: "WATCH", urlTemplate: null },
  { system: "Audio", purpose: "LISTEN", urlTemplate: null },
  { system: "Video", purpose: "WATCH", urlTemplate: null },
  { system: "Spotify", purpose: "LISTEN", urlTemplate: null },
  { system: "Wikipedia", purpose: "IDENTIFY", urlTemplate: null },
  { system: "Official Site", purpose: "READ", urlTemplate: null },
  { system: "Zotero", purpose: "READ", urlTemplate: null },
  { system: "Discogs", purpose: "IDENTIFY", urlTemplate: null },
  { system: "Wikidata", purpose: "IDENTIFY", urlTemplate: null },
  { system: "MusicBrainz", purpose: "IDENTIFY", urlTemplate: null },
];

export type LinkRoute =
  | { kind: "whitegum" }
  | { kind: "report"; reason: string }
  | { kind: "external"; system: string };

/** Decide where an old link goes (migration plan, "Other tables", Link). */
export function routeLink(url: string, typeName: string | null): LinkRoute {
  if (/whitegum/i.test(url)) return { kind: "whitegum" };
  const type = normalizeName(typeName ?? "");
  const byType: Array<[RegExp, string]> = [
    [/live music archive|^lma$|archive\.org/, "Live Music Archive"],
    [/etree/, "EtreeDB"],
    [/lossless/, "Lossless Legs"],
    [/^shn$/, "SHN"],
    [/youtube/, "YouTube"],
    [/vimeo/, "Vimeo"],
    [/^audio$/, "Audio"],
    [/^video$/, "Video"],
    [/spotify/, "Spotify"],
    [/wikipedia/, "Wikipedia"],
    [/official/, "Official Site"],
    [/zotero/, "Zotero"],
    [/discogs/, "Discogs"],
    [/wikidata/, "Wikidata"],
    [/musicbrainz/, "MusicBrainz"],
  ];
  for (const [pattern, system] of byType) {
    if (pattern.test(type)) return { kind: "external", system };
  }
  if (/blog|newspaper/.test(type)) return { kind: "report", reason: "blog or newspaper: add to Zotero" };
  return { kind: "report", reason: "link type has no link system" };
}

/** The identifier inside a URL, when the link system has a template that takes one. */
export function externalValue(system: string, url: string): string {
  if (system === "Live Music Archive") {
    const found = /archive\.org\/details\/([^/?#]+)/i.exec(url);
    if (found) return found[1];
  }
  if (system === "YouTube") {
    const found = /[?&]v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/i.exec(url);
    if (found) return found[1] ?? found[2];
  }
  return url;
}

export type NoteHint = "a-cappella" | "guest" | "bill";

/** Words that make a note a candidate for one of the review lists (section 5, items 1, 13, 14). */
export function noteHints(text: string): NoteHint[] {
  const hints: NoteHint[] = [];
  if (/a\s*cappella|acapella/i.test(text)) hints.push("a-cappella");
  if (/\b(guests?|joined by|sits? in|sat in|sitting in)\b/i.test(text)) hints.push("guest");
  if (/\b(opening act|opened by|opener|openers|supporting act|on the bill|also appearing|bill:)/i.test(text)) {
    hints.push("bill");
  }
  return hints;
}

export type FootnoteKind = "portion" | "instrumental" | "lead-in";

/** Footnotes a rule can type (section 5, item 4). The rest stay notes. */
export function footnoteKinds(text: string): FootnoteKind[] {
  const kinds: FootnoteKind[] = [];
  if (/\b(first|second|third|last|final|opening|closing)\s+(verse|chorus|stanza|refrain)s?\b|\bverses?\s+\d/i.test(text)) {
    kinds.push("portion");
  }
  if (/\binstrumental\b/i.test(text)) kinds.push("instrumental");
  if (/\b(lead-?in|leads? into|segues? from|from the end of)\b/i.test(text)) kinds.push("lead-in");
  return kinds;
}
