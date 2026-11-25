import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { PasskeyButton } from "@/components/admin/passkey-button";

export default function AdminHomePage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <AdminShell title="Admin">
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
