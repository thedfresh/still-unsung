import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { TextLink } from "@/components/admin/ui/components";
import { ROW_CLASS } from "@/components/admin/ui/styles";
import { countLists } from "@/lib/data/lists";

export const metadata = { title: "Lists" };

async function Lists() {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const lists = await countLists();
  return (
    <AdminShell title="Lists">
      <p>Short lists that other records pick from. Open a list to add, rename, reorder or remove its values.</p>
      <ul className="flex flex-col gap-3">
        {lists.map(({ config, count }) => (
          <li key={config.slug} className={ROW_CLASS}>
            <TextLink href={`/admin/lists/${config.slug}`}>{config.plural}</TextLink>
            <p>
              {count} {count === 1 ? "value" : "values"}. {config.purpose}
            </p>
          </li>
        ))}
      </ul>
    </AdminShell>
  );
}

export default function ListsPage() {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Lists />
    </Suspense>
  );
}
