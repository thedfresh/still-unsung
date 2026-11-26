import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { ImportRulesPage } from "@/components/admin/import-rules-view";
import { getImportRulesForAdmin } from "@/lib/data/guide-pages";

export const metadata = { title: "Import rules" };

async function Rules() {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const rules = await getImportRulesForAdmin();
  return (
    <AdminShell title="Import rules">
      <ImportRulesPage rules={rules} />
    </AdminShell>
  );
}

export default function ImportRulesRoute() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Rules />
    </Suspense>
  );
}
