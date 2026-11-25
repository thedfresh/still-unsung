/** Plain words for the show review page. Pure functions: no database, no React. */

type Certainty = "CONFIRMED" | "PROBABLE" | "POSSIBLE" | "UNKNOWN";

/** The words for a certainty, or null when the value is CONFIRMED (the default shows as nothing). */
export function certaintyWords(value: string | null | undefined): string | null {
  switch (value) {
    case "PROBABLE":
      return "probable";
    case "POSSIBLE":
      return "possible";
    case "UNKNOWN":
      return "not known";
    default:
      return null;
  }
}

/** A short note such as "(probable)", or an empty string for a confirmed value. */
export function certaintyNote(value: string | null | undefined): string {
  const words = certaintyWords(value);
  return words ? ` (${words})` : "";
}

const two = (n: number) => String(n).padStart(2, "0");

function partialDate(year: number | null, month: number | null, day: number | null): string | null {
  if (year === null) return null;
  if (month === null) return String(year);
  return day === null ? `${year}-${two(month)}` : `${year}-${two(month)}-${two(day)}`;
}

export interface DateParts {
  dateYear: number | null;
  dateMonth: number | null;
  dateDay: number | null;
  dateEndYear: number | null;
  dateEndMonth: number | null;
  dateEndDay: number | null;
  dateAsWritten: string | null;
  dateCertainty: Certainty | string;
}

/**
 * A date in words. A partial date says what is missing, never a made-up month or day. A range
 * shows its end. The date as the source wrote it follows when it differs. Certainty follows when
 * it is not CONFIRMED.
 */
export function dateInWords(row: DateParts): string {
  const start = partialDate(row.dateYear, row.dateMonth, row.dateDay);
  if (start === null) {
    const written = row.dateAsWritten ? `as written: "${row.dateAsWritten}"` : "date not known";
    return `${written}${certaintyNote(row.dateCertainty)}`;
  }
  const parts = [start];
  const end = partialDate(row.dateEndYear, row.dateEndMonth, row.dateEndDay);
  if (end !== null) parts[0] = `${start} to ${end}`;
  if (row.dateMonth === null) parts.push("month and day not known");
  else if (row.dateDay === null) parts.push("day not known");
  if (row.dateAsWritten && row.dateAsWritten !== start) parts.push(`as written: "${row.dateAsWritten}"`);
  const [first, ...rest] = parts;
  return `${first}${rest.length ? ` (${rest.join("; ")})` : ""}${certaintyNote(row.dateCertainty)}`;
}

/** A date for a one-line label: the ISO date as far as it is known, or "date not known". */
export function shortDate(row: Pick<DateParts, "dateYear" | "dateMonth" | "dateDay" | "dateAsWritten">): string {
  return partialDate(row.dateYear, row.dateMonth, row.dateDay) ?? row.dateAsWritten ?? "date not known";
}

const DELIVERY: Record<string, string> = {
  SUNG: "sung",
  SUNG_A_CAPPELLA: "sung a cappella",
  PLAYED: "played, no words",
  SPOKEN: "spoken",
  RECORDING_PLAYED: "recording played",
};

/** The delivery in words. An empty delivery is the work's default and shows as nothing. */
export function deliveryWords(value: string | null | undefined): string | null {
  return value ? (DELIVERY[value] ?? value.toLowerCase()) : null;
}

const SHOW_STATUS: Record<string, string> = {
  TOOK_PLACE: "took place",
  CANCELED: "canceled",
  SPURIOUS: "spurious (the show never happened)",
  UNKNOWN: "not known",
};

export function showStatusWords(value: string): string {
  return SHOW_STATUS[value] ?? value.toLowerCase();
}

/** The extent in words. COMPLETE is the presumed default and shows as nothing. */
export function extentWords(value: string): string | null {
  return value === "COMPLETE" ? null : value.toLowerCase();
}

/** An enum value as lower-case words: `SEGMENT_CUT_MARKS` becomes "segment cut marks". */
export function enumWords(value: string): string {
  return value.toLowerCase().replace(/_/g, " ");
}

/** The mark after a segment that runs into the next one. */
export function joinMark(value: string): string | null {
  return value === "RUNS_INTO" ? ">" : null;
}

/** The cut marks of a segment in words: only what is set. */
export function cutWords(row: { cutAtStart: boolean; cutAtEnd: boolean; hasGaps: boolean }): string[] {
  const out: string[] = [];
  if (row.cutAtStart) out.push("cut at the start");
  if (row.cutAtEnd) out.push("cut at the end");
  if (row.hasGaps) out.push("has gaps");
  return out;
}

export interface OriginInput {
  path: "ADMIN" | "MCP" | "IMPORT" | string;
  role: string;
  when: Date;
  ownKnowledge: boolean;
  sourceTitle: string | null;
  recordingName: string | null;
  contributorName: string | null;
  place: string | null;
}

/**
 * One short line that says where a record came from, for example
 * `Added by the agent on 2026-11-25 from the recording "FM broadcast"`.
 */
export function describeOrigin(input: OriginInput): string {
  const who = input.path === "IMPORT" ? "the import" : input.role === "AGENT" ? "the agent" : "an admin";
  const evidence: string[] = [];
  if (input.sourceTitle) evidence.push(`the source "${input.sourceTitle}"`);
  if (input.recordingName) evidence.push(`the recording "${input.recordingName}"`);
  if (input.contributorName) evidence.push(`${input.contributorName}`);
  if (input.ownKnowledge) evidence.push("own knowledge");
  let line = `Added by ${who} on ${input.when.toISOString().slice(0, 10)}`;
  if (evidence.length > 0) line += ` from ${evidence.join(" and ")}`;
  if (input.place) line += ` (${input.place})`;
  return line;
}
