import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { IMPORT_RULES_SLUG } from "@/lib/import-rules";
import { CHANGES_PAGE_SIZE } from "@/lib/data/changes/list";

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

export interface ImportRulesView {
  title: string;
  body: string;
  rev: number;
  updatedAt: Date;
  /** The applied change that made the last edit: its ID and the page of the Changes log that lists it. */
  lastChange: { id: number; page: number } | null;
}

/**
 * The import rules for the admin page: the same body an agent receives, with the version, the
 * time of the last change and the change behind it. It ignores the public mark. Only an admin
 * page may call it.
 */
export async function getImportRulesForAdmin(): Promise<ImportRulesView | null> {
  const prisma = getPrisma();
  const page = await prisma.guidePage.findUnique({
    where: { slug: IMPORT_RULES_SLUG },
    select: { id: true, title: true, body: true, rev: true, updatedAt: true },
  });
  if (!page) return null;
  const item = await prisma.changesetItem.findFirst({
    where: { tableName: "guide_pages", recordId: page.id, changeset: { status: "APPLIED", appliedAt: { not: null } } },
    orderBy: [{ changeset: { appliedAt: "desc" } }, { changesetId: "desc" }],
    select: { changeset: { select: { id: true, appliedAt: true } } },
  });
  let lastChange: ImportRulesView["lastChange"] = null;
  if (item?.changeset.appliedAt) {
    const { id, appliedAt } = item.changeset;
    // The Changes log is newest first, so the page counts the changes that sit above this one.
    const newer = await prisma.changeset.count({
      where: { status: "APPLIED", OR: [{ appliedAt: { gt: appliedAt } }, { appliedAt, id: { gt: id } }] },
    });
    lastChange = { id, page: Math.floor(newer / CHANGES_PAGE_SIZE) + 1 };
  }
  return { title: page.title, body: page.body, rev: page.rev, updatedAt: page.updatedAt, lastChange };
}
