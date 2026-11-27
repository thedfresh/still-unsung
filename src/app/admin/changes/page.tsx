import Link from "next/link";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { CARD, ReadoutView } from "@/components/admin/readout-view";
import { TextLink } from "@/components/admin/ui/components";
import { CHANGES_PAGE_SIZE, listChangesets, type ChangesetRow } from "@/lib/data/changes/list";

export const metadata = { title: "Changes" };

function Change({ change }: { change: ChangesetRow }) {
  const when = change.appliedAt ? change.appliedAt.toISOString().slice(0, 16).replace("T", " ") : "not applied";
  return (
    <li id={`change-${change.id}`} className={CARD}>
      <details>
        <summary className="min-h-11 cursor-pointer py-2">
          {change.counts} By {change.userEmail ?? "unknown"} ({change.userRole}). Evidence: {change.evidence}. {when} UTC.
        </summary>
        {change.shows.length > 0 ? (
          <p className="mt-3">
            Shows:{" "}
            {change.shows.map((show, index) => (
              <span key={show.id}>
                {index > 0 ? ", " : ""}
                <Link href={`/admin/shows/${show.id}`} className="font-semibold text-gold-darker underline">
                  {show.label}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        <ReadoutView readout={change.readoutData} />
      </details>
    </li>
  );
}

function Pager({ page, pages }: { page: number; pages: number }) {
  return (
    <nav aria-label="Pages of changes" className="flex flex-wrap items-center gap-4">
      {page > 1 && <TextLink href={`/admin/changes?page=${page - 1}`}>Newer changes</TextLink>}
      <span>
        Page {page} of {pages}
      </span>
      {page < pages && <TextLink href={`/admin/changes?page=${page + 1}`}>Older changes</TextLink>}
    </nav>
  );
}

async function Changes({ pageParam }: { pageParam: Promise<number> }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const requested = await pageParam;
  const { changes, total, page } = await listChangesets(requested);
  const pages = Math.max(1, Math.ceil(total / CHANGES_PAGE_SIZE));
  return (
    <AdminShell title="Changes">
      <p>One line for each applied change, newest first. Open a line to read what it added and changed.</p>
      <p>
        <TextLink href="/admin/changes/pending">Open previews: changes an agent proposed and nobody applied yet</TextLink>
      </p>
      <p>
        <TextLink href="/admin/import-rules">Import rules: the text an agent receives</TextLink>
      </p>
      {changes.length === 0 ? (
        <p>No changes yet.</p>
      ) : (
        <>
          <ul className="flex list-none flex-col gap-3 p-0">
            {changes.map((change) => (
              <Change key={change.id} change={change} />
            ))}
          </ul>
          <Pager page={page} pages={pages} />
        </>
      )}
    </AdminShell>
  );
}

export default function ChangesPage({ searchParams }: PageProps<"/admin/changes">) {
  const pageParam = searchParams.then((p) => {
    const n = typeof p.page === "string" ? Number.parseInt(p.page, 10) : 1;
    return Number.isInteger(n) && n > 0 ? n : 1;
  });
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Changes pageParam={pageParam} />
    </Suspense>
  );
}
