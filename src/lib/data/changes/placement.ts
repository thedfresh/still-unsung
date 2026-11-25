import { AppError } from "@/lib/errors";
import { keyBetween } from "@/lib/sort-key";
import type { ParsedEdit } from "@/lib/validation/content";
import type { Tx } from "@/lib/data/changes/rows";

/**
 * Fill in the set, the parent and the sort key of a new segment that goes before or after
 * another segment. The key goes between the two neighbours as they are in the open transaction,
 * so an earlier edit of the same call counts.
 */
export async function placeSegment(
  tx: Tx,
  index: number,
  placement: NonNullable<ParsedEdit["placement"]>,
  values: Record<string, unknown>,
  refIds: Map<string, number>,
): Promise<Record<string, unknown>> {
  const target = typeof placement.target === "number" ? placement.target : refIds.get(placement.target.ref);
  const next = target === undefined ? null : await tx.segment.findUnique({ where: { id: target }, select: { setId: true, parentId: true, sortKey: true } });
  if (!next) throw new AppError("invalid_input", `Edit ${index}: the segment to go ${placement.side} does not exist.`);
  if (values.setId !== undefined && values.setId !== next.setId) {
    throw new AppError("invalid_input", `Edit ${index}: the new segment must be in the same set as the segment it goes ${placement.side}.`);
  }
  if (values.parentId !== undefined && values.parentId !== next.parentId) {
    throw new AppError("invalid_input", `Edit ${index}: the new segment must have the same parent as the segment it goes ${placement.side}.`);
  }
  const siblings = { setId: next.setId, parentId: next.parentId };
  const other = await tx.segment.findFirst({
    where: { ...siblings, sortKey: placement.side === "after" ? { gt: next.sortKey } : { lt: next.sortKey } },
    orderBy: { sortKey: placement.side === "after" ? "asc" : "desc" },
    select: { sortKey: true },
  });
  const [low, high] =
    placement.side === "after" ? [next.sortKey, other?.sortKey ?? null] : [other?.sortKey ?? null, next.sortKey];
  try {
    return { ...values, ...siblings, sortKey: keyBetween(low, high) };
  } catch {
    throw new AppError("conflict", `Edit ${index}: no sort key fits there. Send a sortKey, or ask the user to reorder the set.`);
  }
}
