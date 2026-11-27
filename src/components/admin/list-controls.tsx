import { TextLink } from "@/components/admin/ui/components";

/** Previous and next page links. `href` builds the address of a page. */
export function Pager({ page, pageCount, href }: { page: number; pageCount: number; href: (page: number) => string }) {
  return (
    <nav aria-label="Pages" className="flex flex-wrap gap-4">
      {page > 1 ? <TextLink href={href(page - 1)}>Previous page</TextLink> : null}
      {page < pageCount ? <TextLink href={href(page + 1)}>Next page</TextLink> : null}
    </nav>
  );
}

/** The address of a list page with its search, sort and page. A default value is left out. */
export function listHref(
  path: string,
  params: { q: string; sort: string; page: number; type?: string },
  defaultSort: string,
  defaultType = "",
  extra: Record<string, string> = {},
): string {
  const query = new URLSearchParams(extra);
  if (params.q) query.set("q", params.q);
  if (params.type && params.type !== defaultType) query.set("type", params.type);
  if (params.sort !== defaultSort) query.set("sort", params.sort);
  if (params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
