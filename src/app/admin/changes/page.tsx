import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { CHANGES_PAGE_SIZE, listChangesets, type ChangesetRow } from "@/lib/data/changes/list";
import type { ReadoutCard, ReadoutField } from "@/lib/changes/readout";

export const metadata = { title: "Changes" };

/** A hairline border, a large radius and a small shadow: the card style of the design system. */
const CARD = "rounded-lg border border-black/15 p-3 shadow-sm dark:border-white/20";

function Field({ field }: { field: ReadoutField }) {
  if (field.was === undefined) {
    return (
      <li>
        <strong>{field.name}</strong>: {field.value}
      </li>
    );
  }
  return (
    <li>
      <strong>{field.name}</strong>
      <div className="ml-4">was: {field.was}</div>
      <div className="ml-4">now: {field.now}</div>
    </li>
  );
}

function Card({ card }: { card: ReadoutCard }) {
  return (
    <li className={CARD}>
      <p className="font-medium">{card.action ? `${card.action} · ${card.title}` : card.title}</p>
      {card.fields.length > 0 && (
        <ul className="mt-1 flex list-none flex-col gap-1 pl-3">
          {card.fields.map((field, index) => (
            <Field key={`${field.name}-${index}`} field={field} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Readout({ readout }: { readout: ChangesetRow["readoutData"] }) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      <p>{readout.counts}</p>
      {readout.unusual.length > 0 && (
        <section>
          <h3 className="font-semibold">Look at these first</h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {readout.unusual.map((card, index) => (
              <Card key={index} card={card} />
            ))}
          </ul>
          {readout.unusualMore > 0 && <p>...and {readout.unusualMore} more. They are in the list below.</p>}
        </section>
      )}
      {readout.groups.map((group, index) => (
        <section key={index}>
          <h3 className="font-semibold">{group.heading}</h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {group.cards.map((card, cardIndex) => (
              <Card key={cardIndex} card={card} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Change({ change }: { change: ChangesetRow }) {
  const when = change.appliedAt ? change.appliedAt.toISOString().slice(0, 16).replace("T", " ") : "not applied";
  return (
    <li className={CARD}>
      <details>
        <summary className="cursor-pointer">
          {change.counts} By {change.userEmail ?? "unknown"} ({change.userRole}). Evidence: {change.evidence}. {when} UTC.
        </summary>
        <Readout readout={change.readoutData} />
      </details>
    </li>
  );
}

function Pager({ page, pages }: { page: number; pages: number }) {
  return (
    <nav aria-label="Pages of changes" className="flex gap-4">
      {page > 1 && <Link href={`/admin/changes?page=${page - 1}`}>Newer changes</Link>}
      <span>
        Page {page} of {pages}
      </span>
      {page < pages && <Link href={`/admin/changes?page=${page + 1}`}>Older changes</Link>}
    </nav>
  );
}

async function Changes({ pageParam }: { pageParam: Promise<number> }) {
  const requested = await pageParam;
  const { changes, total, page } = await listChangesets(requested);
  const pages = Math.max(1, Math.ceil(total / CHANGES_PAGE_SIZE));
  return (
    <AdminShell title="Changes">
      <p>One line for each applied change, newest first. Open a line to read what it added and changed.</p>
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
