import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { listHref, Pager, SearchForm } from "@/components/admin/list-controls";
import { listEntities } from "@/lib/data/entity-lists";
import { ENTITY_CONFIGS, entityKindOf, entityListParamsSchema, SORT_LABEL, SORTS } from "@/lib/entity-lists";

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
  const list = await listEntities(kind, query.q, query.sort, query.page);
  return (
    <AdminShell title={config.plural}>
      <SearchForm action={path} label={config.searchLabel} q={query.q} sort={query.sort} sortOptions={SORT_OPTIONS} />
      <p>
        {list.total} {list.total === 1 ? config.singular : config.plural.toLowerCase()}. Page {list.page} of {list.pageCount}.
      </p>
      {list.rows.length === 0 ? (
        <p>No {config.singular} matches.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.rows.map((row) => (
            <li key={row.id} className="min-w-0 break-words rounded border border-current p-3">
              <Link href={`${path}/${row.id}`} className="font-semibold underline">
                {row.name}
              </Link>
              {row.detail ? <p>{row.detail}</p> : null}
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pageCount={list.pageCount} href={(page) => listHref(path, { ...query, page }, "name")} />
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
