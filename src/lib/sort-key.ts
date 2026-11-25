/**
 * Segment order keys (fractional indexing). A key sorts as bytes (database collation "C"). This
 * helper makes a key that sorts between two others, so an insert never renumbers a segment.
 * The digits are in byte order: 0-9, then A-Z, then a-z.
 */
const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = DIGITS.length;

function digitOf(char: string): number {
  const index = DIGITS.indexOf(char);
  if (index < 0) throw new Error(`"${char}" is not a sort key digit.`);
  return index;
}

/** A string that sorts after `a` (empty means the start) and before `b` (null means the end). */
function midpoint(a: string, b: string | null): string {
  if (b !== null) {
    let n = 0;
    while (n < b.length && (a[n] ?? "0") === b[n]) n += 1;
    if (n > 0) return b.slice(0, n) + midpoint(a.slice(n), b.slice(n));
  }
  const low = a.length > 0 ? digitOf(a[0]) : 0;
  const high = b !== null && b.length > 0 ? digitOf(b[0]) : BASE;
  if (high - low > 1) return DIGITS[Math.round((low + high) / 2)];
  if (b !== null && b.length > 1) return b[0];
  return DIGITS[low] + midpoint(a.slice(1), null);
}

/**
 * A key between two neighbours. `before` is the key of the segment that comes first (null when
 * the new segment goes first). `after` is the key of the one that comes next (null for last).
 * Throws when `before` does not sort strictly before `after`, or when no key fits.
 */
export function keyBetween(before: string | null, after: string | null): string {
  if (before !== null && after !== null && before >= after) {
    throw new Error("The two neighbours have the same sort key or are out of order.");
  }
  const key = midpoint(before ?? "", after);
  if ((before !== null && key <= before) || (after !== null && key >= after)) {
    throw new Error("No sort key fits between the two neighbours.");
  }
  return key;
}
