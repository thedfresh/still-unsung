import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { DesignGallery } from "@/components/admin/design-gallery";

export default function DesignPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <AdminShell title="Design">
        <DesignGallery />
      </AdminShell>
    </Suspense>
  );
}
