/**
 * Drop some items from an ordered list and keep the segue marks honest. If A runs into B and B
 * runs into C, and B is dropped, then A still runs into C. If B does not run into C, A no longer
 * runs into anything visible. Pure: it returns new items and never changes its input.
 */
export function dropWithJoins<T extends { joinsNext: boolean }>(items: readonly T[], keep: (item: T) => boolean): T[] {
  const out: T[] = [];
  let chain = false;
  for (const item of items) {
    if (keep(item)) {
      if (out.length > 0) out[out.length - 1] = { ...out[out.length - 1], joinsNext: chain };
      out.push(item);
      chain = item.joinsNext;
    } else {
      chain = chain && item.joinsNext;
    }
  }
  if (out.length > 0) out[out.length - 1] = { ...out[out.length - 1], joinsNext: false };
  return out;
}
