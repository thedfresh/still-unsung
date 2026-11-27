import Link from "next/link";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { listHref, Pager, SearchForm } from "@/components/admin/list-controls";
import { listShows } from "@/lib/data/shows/list";
import { showListParamsSchema } from "@/lib/validation/shows";

export const metadata = { title: "Shows" };

const SORT_OPTIONS = [
  { value: "newest", label: "Date, newest first" },
  { value: "oldest", label: "Date, oldest first" },
];

async function Shows({ searchParams }: { searchParams: PageProps<"/admin/shows">["searchParams"] }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const query = showListParamsSchema.parse(await searchParams);
  const list = await listShows(query.q, query.page, undefined, query.sort);
  return (
    <AdminShell title="Shows">
      <SearchForm
        action="/admin/shows"
        label="Search by date (1980, 1980-11 or 1980-11-14) or by place name"
        q={query.q}
        sort={query.sort}
        sortOptions={SORT_OPTIONS}
      />
      <p>
        {list.total} {list.total === 1 ? "show" : "shows"}. Page {list.page} of {list.pageCount}.
      </p>
      {list.rows.length === 0 ? (
        <p>No shows match.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.rows.map((show) => (
            <li key={show.id} className="min-w-0 break-words rounded border border-current p-3">
              <Link href={`/admin/shows/${show.id}`} className="font-semibold underline">
                {show.date}
                {show.placeName ? `, ${show.placeName}` : ""}
              </Link>
              <p>
                {[show.band, show.showType].filter(Boolean).join(", ") || "No band or show type"}. {show.setCount}{" "}
                {show.setCount === 1 ? "set" : "sets"}, {show.segmentCount} {show.segmentCount === 1 ? "segment" : "segments"}.
              </p>
              <p className="flex flex-wrap gap-4 underline">
                <Link href={`/admin/shows/${show.id}/edit`} aria-label={`Edit show ${show.date}`}>
                  Edit
                </Link>
                {show.publicHref ? (
                  <Link href={show.publicHref} aria-label={`Public page of show ${show.date}`}>
                    Public page
                  </Link>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pageCount={list.pageCount} href={(page) => listHref("/admin/shows", { ...query, page }, "newest")} />
    </AdminShell>
  );
}

export default function ShowsPage({ searchParams }: PageProps<"/admin/shows">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Shows searchParams={searchParams} />
    </Suspense>
  );
}
