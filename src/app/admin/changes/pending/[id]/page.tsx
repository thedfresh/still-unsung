import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { ReadoutView } from "@/components/admin/readout-view";
import { Message, TextLink } from "@/components/admin/ui/components";
import { getPendingPreview, type PendingPreview } from "@/lib/data/changes/pending";
import { parseId } from "@/lib/ids";

export const metadata = { title: "Open preview" };

const utc = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

function Status({ preview }: { preview: PendingPreview }) {
  if (preview.state === "applied") {
    return (
      <Message tone="success">
        <p>
          This change was applied.{" "}
          <TextLink href={`/admin/changes?page=${preview.appliedPage ?? 1}#change-${preview.id}`}>Read it in the applied changes</TextLink>
        </p>
      </Message>
    );
  }
  if (preview.state === "expired") return <Message tone="info">This preview expired{preview.expiresAt ? ` at ${utc(preview.expiresAt)}` : ""}. The agent must make a new one.</Message>;
  if (preview.state === "used") return <Message tone="info">The apply token of this preview was used, but the apply did not finish. Nothing was saved. The agent must make a new preview.</Message>;
  return (
    <>
      <Message tone="info">This preview is open. It expires at {preview.expiresAt ? utc(preview.expiresAt) : "an unknown time"}. Nothing is saved yet.</Message>
      {preview.warnings.length > 0 && (
        <Message tone="error">
          <p>This preview cannot be applied now:</p>
          <ul className="list-disc pl-6">
            {preview.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Message>
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
        <TextLink href="/admin/changes/pending">All open previews</TextLink>
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
