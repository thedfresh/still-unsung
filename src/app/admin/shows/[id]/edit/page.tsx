import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { ButtonLink } from "@/components/admin/ui/components";
import { ShowEditor } from "@/components/admin/show-editor/show-editor";
import { recentEvidence } from "@/lib/data/changes/admin-save";
import { getShowEditData } from "@/lib/data/shows/edit";
import { parseId } from "@/lib/ids";

export const metadata = { title: "Edit show" };

/** The HTTP 404 for a bad or unknown ID comes from `src/proxy.ts`, as for the review page. */
async function EditShow({ params }: { params: PageProps<"/admin/shows/[id]/edit">["params"] }) {
  // Sign-in first: nothing is read before this call.
  const user = await requireAdminPage();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const show = await getShowEditData(id);
  if (!show) notFound();
  const recent = await recentEvidence(user.id);
  return (
    <AdminShell title={`Edit ${show.title}`}>
      <p className="flex flex-wrap gap-2">
        <ButtonLink href={`/admin/shows/${show.id}`}>Review this show</ButtonLink>
        {show.publicHref ? (
          <ButtonLink href={show.publicHref} variant="quiet">
            Public page
          </ButtonLink>
        ) : null}
      </p>
      <p>Every save is one change. It shows on the Changes page with its evidence.</p>
      <ShowEditor show={show} recent={recent} />
    </AdminShell>
  );
}

export default function EditShowPage({ params }: PageProps<"/admin/shows/[id]/edit">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <EditShow params={params} />
    </Suspense>
  );
}
