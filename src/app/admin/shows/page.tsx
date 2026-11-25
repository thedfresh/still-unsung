import Link from "next/link";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { listShows } from "@/lib/data/shows/list";
import { showListParamsSchema } from "@/lib/validation/shows";

export const metadata = { title: "Shows" };

function pageHref(q: string, page: number): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (page > 1) params.set("page", String(page));
  const text = params.toString();
  return text ? `/admin/shows?${text}` : "/admin/shows";
}

async function Shows({ searchParams }: { searchParams: PageProps<"/admin/shows">["searchParams"] }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const { q, page } = showListParamsSchema.parse(await searchParams);
  const list = await listShows(q, page);
  return (
    <AdminShell title="Shows">
      <form method="get" action="/admin/shows" role="search" className="flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          Search by date (1980, 1980-11 or 1980-11-14) or by place name
          <input name="q" type="search" defaultValue={q} maxLength={100} className="rounded border border-current px-2 py-1" />
        </label>
        <button type="submit" className="self-start rounded border border-current px-4 py-2">
          Search
        </button>
      </form>
      <p>
        {list.total} {list.total === 1 ? "show" : "shows"}, newest first. Page {list.page} of {list.pageCount}.
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
            </li>
          ))}
        </ul>
      )}
      <nav aria-label="Pages" className="flex flex-wrap gap-4 underline">
        {list.page > 1 ? <Link href={pageHref(q, list.page - 1)}>Previous page</Link> : null}
        {list.page < list.pageCount ? <Link href={pageHref(q, list.page + 1)}>Next page</Link> : null}
      </nav>
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
