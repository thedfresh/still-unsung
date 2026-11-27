/** Plain words for the public show page. Pure functions: no database, no React. */
import type { PublicCertainty, PublicDateParts, PublicShow } from "@/lib/data/public/show-types";
import { certaintyNote } from "@/lib/shows/review-words";
import { isTalk } from "@/lib/shows/setlist";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const two = (n: number) => String(n).padStart(2, "0");

function iso(year: number | null, month: number | null, day: number | null): string | null {
  if (year === null) return null;
  if (month === null) return String(year);
  return day === null ? `${year}-${two(month)}` : `${year}-${two(month)}-${two(day)}`;
}

function words(year: number | null, month: number | null, day: number | null): string | null {
  if (year === null) return null;
  if (month === null) return String(year);
  const name = MONTHS[month - 1] ?? String(month);
  return day === null ? `${name} ${year}` : `${name} ${day}, ${year}`;
}

export interface PublicDate {
  /** The date as far as it is known, in words. Never a made-up month or day. */
  text: string;
  /** The ISO date as far as it is known (`1980`, `1980-11`, `1980-11-14`), for `<time>`. Null when no year is known. */
  iso: string | null;
}

/**
 * A show date. A partial date says only what is known. A date that is not confirmed does not
 * give a precise ISO value: the doubt shows in words, and the ISO value stays out (the SEO rule
 * for uncertain dates).
 */
export function publicDate(date: PublicDateParts): PublicDate {
  const start = words(date.dateYear, date.dateMonth, date.dateDay);
  if (start === null) {
    return { text: date.dateAsWritten ? `${date.dateAsWritten} (date as written)` : "Date not known", iso: null };
  }
  const end = words(date.dateEndYear, date.dateEndMonth, date.dateEndDay);
  const text = `${end ? `${start} to ${end}` : start}${certaintyNote(date.dateCertainty)}`;
  const confirmed = date.dateCertainty === "CONFIRMED";
  return { text, iso: confirmed && !end ? iso(date.dateYear, date.dateMonth, date.dateDay) : null };
}

/** The date in the quotable `YYYY-MM-DD` form, as far as it is known. */
export function isoDateText(date: PublicDateParts): string | null {
  return iso(date.dateYear, date.dateMonth, date.dateDay);
}

/** The place and its certainty: "Fillmore West (probable)". */
export function placeText(name: string | null, certainty: PublicCertainty): string | null {
  return name ? `${name}${certaintyNote(certainty)}` : null;
}

/** The name of the show for a title or a heading: "November 14, 1980, Test Radio". */
export function showHeading(show: Pick<PublicShow, "date" | "placeName">): string {
  const date = publicDate(show.date).text;
  return show.placeName ? `${date}, ${show.placeName}` : date;
}

/**
 * The summary paragraph at the top of the page: one or two plain sentences, built from the data,
 * never by a model. It says "in this archive", a true and bounded claim (SEO rules, section 7).
 */
export function showSummary(show: PublicShow): string {
  const performer = show.band?.name ?? "Robert Hunter";
  const when = publicDate(show.date);
  const where = show.placeName ? ` at ${show.placeName}` : "";
  const first = `The archive records a show by ${performer}${where}${show.date.dateYear === null ? "" : ` on ${when.text}`}.`;
  const songs = show.sets.reduce((n, set) => n + countSongs(set.segments), 0);
  const parts: string[] = [];
  if (show.sets.length > 0) {
    parts.push(`${show.sets.length} ${show.sets.length === 1 ? "set" : "sets"}`);
    parts.push(`${songs} ${songs === 1 ? "song segment" : "song segments"}`);
  }
  if (show.recordings.length > 0) {
    parts.push(`${show.recordings.length} ${show.recordings.length === 1 ? "recording" : "recordings"}`);
  }
  return parts.length > 0 ? `${first} In this archive it has ${parts.join(", ")}.` : `${first} The archive holds no setlist for it yet.`;
}

function countSongs(segments: PublicShow["sets"][number]["segments"]): number {
  return segments.reduce(
    (n, segment) => n + (isTalk(segment) ? 0 : 1) + countSongs(segment.children),
    0,
  );
}
