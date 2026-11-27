/**
 * The sort form of a name (folded requirement I18): the name in lower case, without leading
 * punctuation and without a leading "The", "A" or "An". "The Band" sorts under B and
 * `"William Tell" Bridge` under W. A name that is only an article or only punctuation keeps it.
 */
export function sortName(name: string): string {
  const text = name.trim().toLowerCase();
  const unpunctuated = text.replace(/^[^\p{L}\p{N}]+/u, "");
  const base = unpunctuated === "" ? text : unpunctuated;
  const stripped = base.replace(/^(?:the|an|a)\s+/, "").replace(/^[^\p{L}\p{N}]+/u, "");
  return stripped === "" ? base : stripped;
}

/** Compare two names by their sort form, then by the plain name so the order is stable. */
export function compareNames(a: string, b: string): number {
  const bySort = sortName(a).localeCompare(sortName(b), "en");
  return bySort !== 0 ? bySort : a.localeCompare(b, "en");
}
