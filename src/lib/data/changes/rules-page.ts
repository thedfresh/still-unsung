import { IMPORT_RULES_SLUG } from "@/lib/import-rules";
import type { ParsedEdit } from "@/lib/validation/content";
import type { Tx } from "@/lib/data/changes/rows";

const STAYS_PRIVATE = "The import rules page stays private; only its body can change.";
const SLUG_IS_RESERVED = `The slug ${IMPORT_RULES_SLUG} belongs to the private import rules page. An agent cannot make a page with it or rename a page to it.`;

/** True for a create or update of a guide page that sets the slug of the import rules page. */
function setsRulesSlug(edit: ParsedEdit): boolean {
  const slug = edit.fields.slug;
  return edit.type === "GuidePage" && edit.op !== "delete" && typeof slug === "string" && slug.trim().toLowerCase() === IMPORT_RULES_SLUG;
}

/** The IDs of the edits' targets that are the import rules page. */
async function rulesPageIds(tx: Tx, edits: ParsedEdit[]): Promise<Set<number>> {
  const ids = edits.filter((e) => e.type === "GuidePage" && e.id !== undefined).map((e) => e.id as number);
  if (ids.length === 0) return new Set();
  const pages = await tx.guidePage.findMany({ where: { id: { in: ids }, slug: IMPORT_RULES_SLUG }, select: { id: true } });
  return new Set(pages.map((p) => p.id));
}

/** True when any edit targets the import rules page, or sets its slug. Such a change is always private. */
export async function touchesRulesPage(tx: Tx, edits: ParsedEdit[]): Promise<boolean> {
  return edits.some(setsRulesSlug) || (await rulesPageIds(tx, edits)).size > 0;
}

/**
 * Messages for edits that would expose, rename or delete the import rules page, or make another
 * page with its slug. Only its title and body may change. Without the page, `get_import_rules`
 * would fail, and a page with its slug could be public.
 */
export async function findRulesPageRefusals(tx: Tx, edits: ParsedEdit[]): Promise<string[]> {
  const ids = await rulesPageIds(tx, edits);
  const messages: string[] = [];
  for (const [index, edit] of edits.entries()) {
    if (setsRulesSlug(edit)) {
      messages.push(`Edit ${index}: ${SLUG_IS_RESERVED}`);
    } else if (edit.type === "GuidePage" && edit.id !== undefined && ids.has(edit.id)) {
      if (edit.op === "delete" || "isPublic" in edit.fields || "slug" in edit.fields) messages.push(`Edit ${index}: ${STAYS_PRIVATE}`);
    }
  }
  return messages;
}
