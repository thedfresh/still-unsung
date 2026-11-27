/**
 * A partial date: a year only, a year and month, or a full date (docs/CONVENTIONS.md, section
 * 4). A missing month or day stays missing: nothing here fills it with 1.
 */
export interface PartialDate {
  year: number | null;
  month: number | null;
  day: number | null;
}

export type PartialDateResult = { ok: true; date: PartialDate } | { ok: false; error: string };

/** Read three text fields. Empty is allowed for all three: the date is then not known. */
export function parsePartialDate(yearText: string, monthText: string, dayText: string): PartialDateResult {
  const part = (text: string, label: string, min: number, max: number): number | null | string => {
    const value = text.trim();
    if (value === "") return null;
    const number = Number(value);
    if (!/^\d+$/.test(value) || number < min || number > max) return `Enter ${label} as a whole number from ${min} to ${max}, or leave it empty.`;
    return number;
  };
  const year = part(yearText, "the year", 1, 9999);
  const month = part(monthText, "the month", 1, 12);
  const day = part(dayText, "the day", 1, 31);
  for (const value of [year, month, day]) if (typeof value === "string") return { ok: false, error: value };
  const [y, m, d] = [year as number | null, month as number | null, day as number | null];
  if (m !== null && y === null) return { ok: false, error: "Enter the year too, or clear the month and the day." };
  if (d !== null && m === null) return { ok: false, error: "Enter the month too, or clear the day." };
  if (y !== null && m !== null && d !== null) {
    const check = new Date(Date.UTC(2000, m - 1, d));
    check.setUTCFullYear(y);
    if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return { ok: false, error: "That day does not exist in that month." };
  }
  return { ok: true, date: { year: y, month: m, day: d } };
}
