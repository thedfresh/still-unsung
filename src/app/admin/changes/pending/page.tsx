import Link from "next/link";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { CARD } from "@/components/admin/readout-view";
import { listPendingPreviews } from "@/lib/data/changes/pending";

export const metadata = { title: "Open previews" };

const utc = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

async function Pending() {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const previews = await listPendingPreviews();
  return (
    <AdminShell title="Open previews">
      <p>Changes that an agent proposed and nobody applied yet, newest first. Open one to read it as cards.</p>
      {previews.length === 0 ? (
        <p>No open previews.</p>
      ) : (
        <ul className="flex list-none flex-col gap-3 p-0">
          {previews.map((preview) => (
            <li key={preview.id} className={CARD}>
              <Link href={`/admin/changes/pending/${preview.id}`} className="underline">
                {preview.counts}
              </Link>{" "}
              By {preview.userEmail ?? "unknown"}. Evidence: {preview.evidence}. Made {utc(preview.createdAt)}. Expires {utc(preview.expiresAt)}.
            </li>
          ))}
        </ul>
      )}
      <p>
        <Link href="/admin/changes" className="underline">
          Back to the applied changes
        </Link>
      </p>
    </AdminShell>
  );
}

export default function PendingPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Pending />
    </Suspense>
  );
}
