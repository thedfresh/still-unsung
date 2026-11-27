import { Button, TextLink } from "@/components/admin/ui/components";
import { FIELD_CLASS, INPUT_CLASS, LABEL_CLASS } from "@/components/admin/ui/styles";

interface SearchProps {
  /** The page path, for example "/admin/works". */
  action: string;
  label: string;
  q: string;
  sort: string;
  sortOptions: ReadonlyArray<{ value: string; label: string }>;
  /** An extra choice, such as the kind of place to list. */
  filter?: { name: string; label: string; value: string; options: ReadonlyArray<{ value: string; label: string }> };
}

/** The search box and the sort choice of a list page. A plain GET form: it works without scripts. */
export function SearchForm({ action, label, q, sort, sortOptions, filter }: SearchProps) {
  return (
    <form method="get" action={action} role="search" className="flex flex-col gap-3">
      <label className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>{label}</span>
        <input name="q" type="search" defaultValue={q} maxLength={100} className={INPUT_CLASS} />
      </label>
      {filter ? (
        <label className={FIELD_CLASS}>
          <span className={LABEL_CLASS}>{filter.label}</span>
          <select name={filter.name} defaultValue={filter.value} className={INPUT_CLASS}>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>Sort by</span>
        <select name="sort" defaultValue={sort} className={INPUT_CLASS}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="primary" className="self-start">
        Search
      </Button>
    </form>
  );
}

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
): string {
  const query = new URLSearchParams();
  if (params.q) query.set("q", params.q);
  if (params.type && params.type !== defaultType) query.set("type", params.type);
  if (params.sort !== defaultSort) query.set("sort", params.sort);
  if (params.page > 1) query.set("page", String(params.page));
  const text = query.toString();
  return text ? `${path}?${text}` : path;
}
