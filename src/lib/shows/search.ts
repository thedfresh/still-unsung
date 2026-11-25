export type ShowSearch =
  | { kind: "all" }
  | { kind: "date"; year: number; month: number | null; day: number | null }
  | { kind: "place"; text: string };

const DATE = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/;

/**
 * Read the search box. `1980`, `1980-11` and `1980-11-14` search by date; any other text
 * searches place names. An impossible month or day (`1980-13`) is plain text, so it finds nothing.
 */
export function parseShowSearch(input: string): ShowSearch {
  const text = input.trim();
  if (text === "") return { kind: "all" };
  const match = DATE.exec(text);
  if (match) {
    const month = match[2] === undefined ? null : Number(match[2]);
    const day = match[3] === undefined ? null : Number(match[3]);
    if ((month === null || (month >= 1 && month <= 12)) && (day === null || (day >= 1 && day <= 31))) {
      return { kind: "date", year: Number(match[1]), month, day };
    }
  }
  return { kind: "place", text };
}
