import Link from "next/link";
import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PasskeyButton } from "@/components/admin/passkey-button";

export default function AdminHomePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <AdminShell title="Admin">
        <section aria-labelledby="shows" className="flex flex-col gap-3">
          <h2 id="shows" className="text-xl font-semibold">
            Shows
          </h2>
          <p>Check one show in one pass: its sets, segments, references and citations.</p>
          <Link href="/admin/shows" className="underline">
            Open the show list
          </Link>
        </section>
        <section aria-labelledby="previews" className="flex flex-col gap-3">
          <h2 id="previews" className="text-xl font-semibold">
            Open previews
          </h2>
          <p>Read a change that an agent proposed, as cards, before you approve it.</p>
          <Link href="/admin/changes/pending" className="underline">
            Open the list of previews
          </Link>
        </section>
        <section aria-labelledby="passkey" className="flex flex-col gap-3">
          <h2 id="passkey" className="text-xl font-semibold">
            Passkey
          </h2>
          <p>Add a passkey to this account. Then you can sign in without Google.</p>
          <PasskeyButton action="register">Add a passkey</PasskeyButton>
        </section>
      </AdminShell>
    </Suspense>
  );
}
