import { modelInfo } from "@/lib/content-access";
import { withType } from "@/lib/changes/labels";
import type { LinkInfo, ReadoutItem } from "@/lib/changes/readout";
import { parseId } from "@/lib/ids";
import { adminHref } from "@/lib/record-links";

/**
 * The links of the Changes page (HSA-186). The readout is plain words; this file finds, for each
 * value that names a record, the admin page to link it to. A record that only a preview makes
 * has no page yet, so it gets no link.
 */

/** A part of a field value that names a record, with its admin page. The page draws it as a link. */
export interface ReadoutLink {
  /** The words in the value that name the record. */
  text: string;
  href: string;
}

/** The type that a field points at, or null when the field is not a link. */
export function targetType(type: string, field: string): string | null {
  return field === "id" ? null : (modelInfo(type)?.fields[field]?.fk ?? null);
}

/**
 * The link of a field that points at a record: the words that the readout prints for it, and
 * the admin page. A record made in the same call has no page until the changeset is applied.
 */
export function fieldLink(item: ReadoutItem, field: string, value: unknown, link: LinkInfo | undefined): ReadoutLink | null {
  if (!link || link.deleted || typeof value !== "number" || (link.isNew && !item.stored)) return null;
  const href = adminHref(link.type, value);
  if (!href) return null;
  return { text: link.isNew || targetType(item.type, field) === "Entity" ? withType(link.type, link.label) : link.name, href };
}

/** The `links` part of a field: nothing when no value in it links. */
export function linksOf(...links: Array<ReadoutLink | null>): { links?: ReadoutLink[] } {
  const found = links.filter((link) => link !== null);
  return found.length > 0 ? { links: found } : {};
}

/** The admin page of the record of an item: it must exist now (changed, or made by an applied changeset). */
export function recordHref(item: ReadoutItem): string | null {
  const id = parseId(item.after.id);
  if (item.op === "delete" || id === null) return null;
  return item.op === "update" || item.stored ? adminHref(item.type, id) : null;
}

/** `{ href }` for a card whose record has a page, else nothing. */
export function hrefPart(item: ReadoutItem): { href?: string } {
  const href = recordHref(item);
  return href ? { href } : {};
}

/** The admin page of a group's parent record, from the group key `Type:id`; none when the record has no page yet. */
export function groupHref(key: string, hasNoPage: Set<string>): string | null {
  const [type, idText] = key.split(":");
  const id = parseId(idText);
  return hasNoPage.has(key) || id === null ? null : adminHref(type, id);
}
