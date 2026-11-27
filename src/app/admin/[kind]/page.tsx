import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { listHref, Pager } from "@/components/admin/list-controls";
import { SearchForm } from "@/components/admin/search-form";
import { TextLink } from "@/components/admin/ui/components";
import { ROW_CLASS } from "@/components/admin/ui/styles";
import { listEntities, placeTypeOptions } from "@/lib/data/entity-lists";
import { DEFAULT_PLACE_TYPE, ENTITY_CONFIGS, entityKindOf, entityListParamsSchema, SORT_LABEL, SORTS } from "@/lib/entity-lists";

export const metadata = { title: "Records" };

const SORT_OPTIONS = SORTS.map((value) => ({ value, label: SORT_LABEL[value] }));

async function EntityListPage({ params, searchParams }: PageProps<"/admin/[kind]">) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const kind = entityKindOf((await params).kind);
  if (!kind) notFound();
  const config = ENTITY_CONFIGS[kind];
  const path = `/admin/${kind}`;
  const query = entityListParamsSchema.parse(await searchParams);
  // Places: venues by default, with a choice of kind (HSA-185). Other lists have no filter.
  const typeOptions = kind === "places" ? await placeTypeOptions() : null;
  const known = (value: string) => typeOptions?.some((o) => o.value === value) ?? false;
  // Venues by default; if the kind list has no "venue" (an unseeded database), all places.
  const fallback = known(DEFAULT_PLACE_TYPE) ? DEFAULT_PLACE_TYPE : "all";
  const type = typeOptions ? (known(query.type) ? query.type : fallback) : "";
  const list = await listEntities(kind, query.q, query.sort, query.page, type);
  const typeLabel = typeOptions?.find((o) => o.value === type)?.label.toLowerCase();
  return (
    <AdminShell title={config.plural}>
      <SearchForm
        action={path}
        label={config.searchLabel}
        q={query.q}
        sort={query.sort}
        defaultSort="name"
        sortOptions={SORT_OPTIONS}
        filter={typeOptions ? { name: "type", label: "Show", value: type, defaultValue: fallback, options: typeOptions } : undefined}
      />
      <p role="status">
        {list.total} {typeLabel && type !== "all" ? `${typeLabel}` : list.total === 1 ? config.singular : config.plural.toLowerCase()}. Page {list.page} of {list.pageCount}.
      </p>
      {list.rows.length === 0 ? (
        <p>No {config.singular} matches.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.rows.map((row) => (
            <li key={row.id} className={ROW_CLASS}>
              <TextLink href={`${path}/${row.id}`}>{row.name}</TextLink>
              {row.detail ? <p>{row.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pageCount={list.pageCount} href={(page) => listHref(path, { ...query, type, page }, "name", typeOptions ? fallback : "")} />
    </AdminShell>
  );
}

export default function Page(props: PageProps<"/admin/[kind]">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <EntityListPage {...props} />
    </Suspense>
  );
}
