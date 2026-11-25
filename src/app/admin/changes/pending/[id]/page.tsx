import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { ReadoutView } from "@/components/admin/readout-view";
import { getPendingPreview, type PendingPreview } from "@/lib/data/changes/pending";
import { parseId } from "@/lib/ids";

export const metadata = { title: "Open preview" };

const utc = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

function Status({ preview }: { preview: PendingPreview }) {
  if (preview.state === "applied") {
    return (
      <p role="status">
        This change was applied.{" "}
        <Link href={`/admin/changes#change-${preview.id}`} className="underline">
          Read it in the applied changes
        </Link>
      </p>
    );
  }
  if (preview.state === "expired") return <p role="status">This preview expired{preview.expiresAt ? ` at ${utc(preview.expiresAt)}` : ""}. The agent must make a new one.</p>;
  if (preview.state === "used") return <p role="status">The apply token of this preview was used, but the apply did not finish. Nothing was saved. The agent must make a new preview.</p>;
  return (
    <>
      <p role="status">This preview is open. It expires at {preview.expiresAt ? utc(preview.expiresAt) : "an unknown time"}. Nothing is saved yet.</p>
      {preview.warnings.length > 0 && (
        <div role="alert">
          <p>This preview cannot be applied now:</p>
          <ul className="list-disc pl-6">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

async function PendingPreviewView({ params }: { params: PageProps<"/admin/changes/pending/[id]">["params"] }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const preview = await getPendingPreview(id);
  if (!preview) notFound();
  return (
    <AdminShell title={`Preview ${preview.id}`}>
      <Status preview={preview} />
      <p>
        By {preview.userEmail ?? "unknown"} ({preview.userRole}). Evidence: {preview.evidence}. Made {utc(preview.createdAt)}.
      </p>
      {preview.readout ? <ReadoutView readout={preview.readout} /> : <p>{preview.counts}</p>}
      <p>
        <Link href="/admin/changes/pending" className="underline">
          All open previews
        </Link>
      </p>
    </AdminShell>
  );
}

export default function PendingPreviewPage({ params }: PageProps<"/admin/changes/pending/[id]">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <PendingPreviewView params={params} />
    </Suspense>
  );
}
