import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { IMPORT_RULES_SLUG } from "@/lib/import-rules";

/**
 * The agent import rules: the body and the `rev` to cite in an update. Read on every call, never
 * cached, so an edit takes effect at once. This is the agent read path: it ignores the public mark.
 */
export async function getImportRules(): Promise<{ title: string; body: string; rev: number }> {
  const page = await getPrisma().guidePage.findUnique({
    where: { slug: IMPORT_RULES_SLUG },
    select: { title: true, body: true, rev: true },
  });
  if (!page) throw new AppError("not_found", "The import rules page does not exist yet. Ask the user to create it.");
  return page;
}

/**
 * A guide page for the public site, by slug. A page whose entity is private is never returned:
 * it reads as missing. Every public read of a guide page goes through this function.
 */
export async function getPublicGuidePage(slug: string) {
  return getPrisma().guidePage.findFirst({
    where: { slug, entity: { isPublic: true } },
    select: { id: true, title: true, body: true, slug: true, updatedAt: true },
  });
}

/** Public guide pages for the site map and for search. Private pages are left out. */
export async function listPublicGuidePages() {
  return getPrisma().guidePage.findMany({
    where: { entity: { isPublic: true } },
    orderBy: { title: "asc" },
    select: { id: true, title: true, slug: true },
  });
}
