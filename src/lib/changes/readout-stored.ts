import type { Row } from "@/lib/changes/labels";
import { EARLIER, type ItemDetail, type ReadoutItem } from "@/lib/changes/readout";

/**
 * Build the item of a stored changeset: its rows, and the detail that the apply step saved. An
 * item stored before the detail existed has no grouping: it goes in one "earlier change" group.
 * The caller may pass links that it looked up for such an item. Every record in an applied
 * changeset exists now, so the item is marked `stored` and its records can link (HSA-186).
 */
export function storedReadoutItem(
  item: { type: string; label: string; action: string; before: Row | null; after: Row | null; detail: ItemDetail | null },
): ReadoutItem {
  return {
    op: item.action === "CREATE" ? "create" : item.action === "DELETE" ? "delete" : "update",
    type: item.type,
    label: item.label,
    before: item.before,
    after: item.after ?? item.before ?? {},
    links: item.detail?.links ?? { before: {}, after: {} },
    parent: item.detail?.parent ?? EARLIER,
    stored: true,
  };
}
