import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { ListEditor } from "@/components/admin/lists/list-editor";
import { TextLink } from "@/components/admin/ui/components";
import { recentEvidence } from "@/lib/data/changes/admin-save";
import { getListRows } from "@/lib/data/lists";
import { listConfigBySlug } from "@/lib/lists/config";

export const metadata = { title: "List" };

/** The HTTP 404 for an unknown list comes from `src/proxy.ts`; see the note on the show page. */
async function List({ params }: { params: PageProps<"/admin/lists/[list]">["params"] }) {
  // Sign-in first: nothing is read before this call.
  const user = await requireAdminPage();
  const config = listConfigBySlug((await params).list);
  if (!config) notFound();
  const [rows, recent] = await Promise.all([getListRows(config), recentEvidence(user.id)]);
  return (
    <AdminShell title={config.plural}>
      <p>{config.purpose}</p>
      <TextLink href="/admin/lists">All lists</TextLink>
      <ListEditor config={config} rows={rows} recent={recent} />
    </AdminShell>
  );
}

export default function ListPage({ params }: PageProps<"/admin/lists/[list]">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <List params={params} />
    </Suspense>
  );
}
