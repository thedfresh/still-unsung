import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { TextLink } from "@/components/admin/ui/components";
import { Facts } from "@/components/admin/show-review/parts";
import type { ReactNode } from "react";
import { getEntityDetail, type FactValue } from "@/lib/data/entity-lists";
import { ENTITY_CONFIGS, entityKindOf } from "@/lib/entity-lists";
import { parseId } from "@/lib/ids";

export const metadata = { title: "Record" };

/** A fact value as text, or as a link when it has an address. A count link says what it opens. */
function factNode(value: FactValue | null): ReactNode {
  if (value === null || typeof value === "string") return value;
  return (
    <TextLink href={value.href}>
      {value.text}
      {value.opens ? <span className="sr-only">, open {value.opens}</span> : null}
    </TextLink>
  );
}

/** The status of an unknown ID is 404 from `src/proxy.ts`; `notFound()` here only shows the page. */
async function RecordPage({ params }: PageProps<"/admin/[kind]/[id]">) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const { kind: kindText, id: idText } = await params;
  const kind = entityKindOf(kindText);
  const id = parseId(idText);
  if (!kind || id === null) notFound();
  const detail = await getEntityDetail(kind, id);
  if (!detail) notFound();
  return (
    <AdminShell title={detail.title}>
      <p>This page is read-only. Editors for {ENTITY_CONFIGS[kind].plural.toLowerCase()} come later. Fields marked (private) are for admins only.</p>
      <Facts items={detail.facts.map(([label, value]) => [label, factNode(value)])} />
      <TextLink href={`/admin/${kind}`}>Back to {ENTITY_CONFIGS[kind].plural.toLowerCase()}</TextLink>
    </AdminShell>
  );
}

export default function Page(props: PageProps<"/admin/[kind]/[id]">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <RecordPage {...props} />
    </Suspense>
  );
}
