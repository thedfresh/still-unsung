import { Suspense } from "react";
import Link from "next/link";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { changedFields, showValue } from "@/lib/changes/labels";
import { listChangesets, type ChangesetRow } from "@/lib/data/changes/list";

export const metadata = { title: "Changes" };

function ItemLines({ item }: { item: ChangesetRow["items"][number] }) {
  const fields =
    item.action === "UPDATE" && item.before && item.after
      ? changedFields(item.before, item.after).map(([name, from, to]) => `${name}: ${showValue(from)} → ${showValue(to)}`)
      : Object.entries(item.after ?? {})
          .filter(([, value]) => value !== null)
          .map(([name, value]) => `${name}: ${showValue(value)}`);
  return (
    <li>
      <span className="font-semibold">
        {item.action} {item.label}
      </span>
      <ul className="ml-4 list-disc break-words">
        {fields.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </li>
  );
}

function Change({ change }: { change: ChangesetRow }) {
  return (
    <li className="rounded border border-current p-3">
      <details>
        <summary className="cursor-pointer">
          Change {change.id}: {change.summary}
        </summary>
        <dl className="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
          <dt>Made by</dt>
          <dd className="break-all">
            {change.userEmail} ({change.userRole})
          </dd>
          <dt>Path</dt>
          <dd>{change.path}</dd>
          <dt>Status</dt>
          <dd>{change.status}</dd>
          <dt>Evidence</dt>
          <dd>{change.evidence}</dd>
          <dt>Public</dt>
          <dd>{change.isPublic ? "Yes" : "No"}</dd>
          <dt>Applied</dt>
          <dd>{change.appliedAt ? change.appliedAt.toISOString() : "Not applied"}</dd>
        </dl>
        {change.shows.length > 0 ? (
          <p className="mt-3">
            Shows:{" "}
            {change.shows.map((show, index) => (
              <span key={show.id}>
                {index > 0 ? ", " : ""}
                <Link href={`/admin/shows/${show.id}`} className="underline">
                  {show.label}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        <h3 className="mt-3 font-semibold">Changes with the previous state</h3>
        <ul className="flex flex-col gap-2">
          {change.items.map((item) => (
            <ItemLines key={item.position} item={item} />
          ))}
        </ul>
      </details>
    </li>
  );
}

async function Changes() {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const changes = await listChangesets();
  return (
    <AdminShell title="Changes">
      <p>The latest changes, with who made each one. Open one to see its evidence and what it changed.</p>
      {changes.length === 0 ? (
        <p>No changes yet.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {changes.map((change) => (
            <Change key={change.id} change={change} />
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

export default function ChangesPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Changes />
    </Suspense>
  );
}
