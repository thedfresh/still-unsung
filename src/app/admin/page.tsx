import Link from "next/link";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { PasskeyButton } from "@/components/admin/passkey-button";
import { ADMIN_GROUPS, ADMIN_NAV } from "@/lib/admin-nav";
import { listChangesets } from "@/lib/data/changes/list";

export const metadata = { title: "Admin" };

const RECENT = 5;

async function AdminHome() {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const { changes } = await listChangesets(1, RECENT);
  return (
    <AdminShell title="Admin">
      <section aria-labelledby="recent" className="flex flex-col gap-3">
        <h2 id="recent" className="text-xl font-semibold">
          Recent changes
        </h2>
        {changes.length === 0 ? (
          <p>No change was saved yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {changes.map((change) => (
              <li key={change.id} className="min-w-0 break-words rounded border border-current p-3">
                <Link href={`/admin/changes#change-${change.id}`} className="underline">
                  {change.counts}
                </Link>{" "}
                By {change.userEmail ?? "unknown"} ({change.userRole}).{" "}
                {change.appliedAt ? `${change.appliedAt.toISOString().slice(0, 16).replace("T", " ")} UTC.` : ""}
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/changes" className="underline">
          Open the full log of changes
        </Link>
      </section>
      {ADMIN_GROUPS.map((group) => (
        <section key={group} aria-labelledby={`group-${group}`} className="flex flex-col gap-3">
          <h2 id={`group-${group}`} className="text-xl font-semibold">
            {group}
          </h2>
          <ul className="flex flex-col gap-3">
            {ADMIN_NAV.filter((item) => item.group === group).map((item) => (
              <li key={item.href} className="min-w-0 break-words rounded border border-current p-3">
                <Link href={item.href} className="font-semibold underline">
                  {item.label}
                </Link>
                <p>{item.purpose}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <section aria-labelledby="passkey" className="flex flex-col gap-3">
        <h2 id="passkey" className="text-xl font-semibold">
          Passkey
        </h2>
        <p>Add a passkey to this account. Then you can sign in without Google.</p>
        <PasskeyButton action="register">Add a passkey</PasskeyButton>
      </section>
    </AdminShell>
  );
}

export default function AdminHomePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <AdminHome />
    </Suspense>
  );
}
