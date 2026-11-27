import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { ShowReviewView } from "@/components/admin/show-review/show-review";
import { recentEvidence } from "@/lib/data/changes/admin-save";
import { getShowReview } from "@/lib/data/shows/review";
import { parseId } from "@/lib/ids";

export const metadata = { title: "Show" };

/**
 * `notFound()` here shows the not-found page, but the status is already 200: with Cache
 * Components the page streams after its prerendered shell. The HTTP 404 for a bad or unknown
 * ID comes from `src/proxy.ts`, which runs before the page renders.
 */
async function ShowReview({ params }: { params: PageProps<"/admin/shows/[id]">["params"] }) {
  // Sign-in first: nothing is read before this call.
  const user = await requireAdminPage();
  const id = parseId((await params).id);
  if (id === null) notFound();
  const show = await getShowReview(id);
  if (!show) notFound();
  const recent = await recentEvidence(user.id);
  return (
    <AdminShell title={show.title}>
      <p>Review of this show, in reading order. Parts marked (private) are for admins only. You can edit a segment summary.</p>
      <p>
        <Link href={`/admin/shows/${show.id}/edit`} className="underline">
          Edit this show
        </Link>
      </p>
      <ShowReviewView show={show} recent={recent} />
    </AdminShell>
  );
}

export default function ShowReviewPage({ params }: PageProps<"/admin/shows/[id]">) {
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <ShowReview params={params} />
    </Suspense>
  );
}
