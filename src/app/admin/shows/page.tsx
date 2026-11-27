import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { listHref, Pager, SearchForm } from "@/components/admin/list-controls";
import { ButtonLink, RecordLink, TextLink } from "@/components/admin/ui/components";
import { ROW_CLASS } from "@/components/admin/ui/styles";
import { listShows, type ShowListFilterNames } from "@/lib/data/shows/list";
import { adminHref, type ShowsFilter } from "@/lib/record-links";
import { showListParamsSchema } from "@/lib/validation/shows";

export const metadata = { title: "Shows" };

const SORT_OPTIONS = [
  { value: "newest", label: "Date, newest first" },
  { value: "oldest", label: "Date, oldest first" },
];

/** The filters of the page as query values, for the search form and the pager. */
function filterValues(filter: ShowsFilter): Record<string, string> {
  return {
    ...(filter.place !== undefined ? { place: String(filter.place) } : {}),
    ...(filter.place !== undefined && filter.direct ? { direct: "1" } : {}),
    ...(filter.band !== undefined ? { band: String(filter.band) } : {}),
    ...(filter.work !== undefined ? { work: String(filter.work) } : {}),
  };
}

/** Says what the list is filtered by. Each name links to its record. */
function FilterNote({ names, direct }: { names: ShowListFilterNames; direct: boolean }) {
  const parts = [
    names.place ? { key: "place", label: direct ? "Attached to the place" : "At the place or inside it", record: names.place, type: "Place" } : null,
    names.band ? { key: "band", label: "Billed as the band", record: names.band, type: "Band" } : null,
    names.work ? { key: "work", label: "With a segment of the work", record: names.work, type: "Work" } : null,
  ].filter((part) => part !== null);
  if (parts.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p>
        {parts.map((part, index) => (
          <span key={part.key}>
            {index > 0 ? "; " : ""}
            {part.label}: <RecordLink href={adminHref(part.type, part.record.id)}>{part.record.name}</RecordLink>
          </span>
        ))}
        .
      </p>
      <TextLink href="/admin/shows">Show all shows</TextLink>
    </div>
  );
}

async function Shows({ searchParams }: { searchParams: PageProps<"/admin/shows">["searchParams"] }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const query = showListParamsSchema.parse(await searchParams);
  const filter: ShowsFilter = { place: query.place, direct: query.direct === "1", band: query.band, work: query.work };
  const list = await listShows(query.q, query.page, undefined, query.sort, filter);
  const extra = filterValues(filter);
  return (
    <AdminShell title="Shows">
      <SearchForm
        action="/admin/shows"
        label="Search by date (1980, 1980-11 or 1980-11-14) or by place name"
        q={query.q}
        sort={query.sort}
        sortOptions={SORT_OPTIONS}
        hidden={extra}
      />
      <FilterNote names={list.filters} direct={filter.direct === true} />
      <p>
        {list.total} {list.total === 1 ? "show" : "shows"}. Page {list.page} of {list.pageCount}.
      </p>
      {list.rows.length === 0 ? (
        <p>No shows match.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {list.rows.map((show) => (
            <li key={show.id} className={ROW_CLASS}>
              <TextLink href={`/admin/shows/${show.id}`}>
                {show.date}
                {show.placeName ? `, ${show.placeName}` : ""}
              </TextLink>
              <p>
                {show.band && show.bandId !== null ? (
                  <RecordLink href={adminHref("Band", show.bandId)} aria-label={`Band ${show.band}`}>
                    {show.band}
                  </RecordLink>
                ) : null}
                {show.band && show.showType ? ", " : ""}
                {show.showType}
                {!show.band && !show.showType ? "No band or show type" : ""}. {show.setCount} {show.setCount === 1 ? "set" : "sets"},{" "}
                {show.segmentCount} {show.segmentCount === 1 ? "segment" : "segments"}.
              </p>
              <p className="flex flex-wrap gap-2">
                <ButtonLink href={`/admin/shows/${show.id}/edit`} aria-label={`Edit show ${show.date}`}>
                  Edit
                </ButtonLink>
                {show.placeId !== null ? (
                  <ButtonLink href={adminHref("Place", show.placeId) ?? "/admin/places"} variant="quiet" aria-label={`Place of show ${show.date}`}>
                    Place
                  </ButtonLink>
                ) : null}
                {show.publicHref ? (
                  <ButtonLink href={show.publicHref} variant="quiet" aria-label={`Public page of show ${show.date}`}>
                    Public page
                  </ButtonLink>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager page={list.page} pageCount={list.pageCount} href={(page) => listHref("/admin/shows", { ...query, page }, "newest", "", extra)} />
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
