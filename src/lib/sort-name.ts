/**
 * The sort form of a name (folded requirement I18): the name in lower case, without a leading
 * "The", "A" or "An". "The Band" sorts under B. A name that is only an article keeps it.
 */
export function sortName(name: string): string {
  const text = name.trim().toLowerCase();
  const stripped = text.replace(/^(?:the|an|a)\s+/, "");
  return stripped === "" ? text : stripped;
}

/** Compare two names by their sort form, then by the plain name so the order is stable. */
export function compareNames(a: string, b: string): number {
  const bySort = sortName(a).localeCompare(sortName(b), "en");
  return bySort !== 0 ? bySort : a.localeCompare(b, "en");
}
