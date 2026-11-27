import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShowHeader } from "@/components/ui/show/show-header";
import { ViewSwitch, SetlistView } from "@/components/ui/show/setlist-view";
import { Footnotes, Recordings, ShowNotes, StageTalk } from "@/components/ui/show/show-sections";
import { getAdjacentPublicShows, getPublicShow } from "@/lib/data/public/show";
import { jsonLdText, showJsonLd } from "@/lib/json-ld";
import { bandThemeClass } from "@/lib/band-theme";
import { showHeading, showSummary } from "@/lib/shows/public-words";
import { buildSetlist, stageTalk, type SetlistView as View } from "@/lib/shows/setlist";
import { SITE_NAME } from "@/lib/site-config";

/** `?view=complete` shows the complete setlist. Any other value is the standard view. */
function viewOf(value: string | string[] | undefined): View {
  return value === "complete" ? "complete" : "standard";
}

export async function generateMetadata({ params }: PageProps<"/shows/[slug]">): Promise<Metadata> {
  const show = await getPublicShow((await params).slug);
  if (!show) return { title: "Show not found" };
  const performer = show.band?.name ?? "Robert Hunter";
  return {
    title: `${performer}, ${showHeading(show)} – shows – ${SITE_NAME}`,
    description: showSummary(show),
  };
}

/**
 * `notFound()` here shows the not-found page, but the status is already 200: with Cache
 * Components the page streams after its prerendered shell. The HTTP 404 for an unknown slug comes
 * from `src/proxy.ts`, which runs before the page renders. The data is not cached yet: nothing
 * refreshes a cache after an agent edit (docs/CONVENTIONS.md, section 5), so the page reads fresh.
 */
async function ShowPage({ params, searchParams }: Pick<PageProps<"/shows/[slug]">, "params" | "searchParams">) {
  const show = await getPublicShow((await params).slug);
  if (!show) notFound();
  const view = viewOf((await searchParams).view);
  const { prev, next } = await getAdjacentPublicShows(show.id);
  const setlist = buildSetlist(show.sets, view);
  const talk = stageTalk(show.sets);
  const hasSecondColumn = talk.length > 0;

  return (
    <article className={`${bandThemeClass(show.band)} mx-auto w-full max-w-site px-0 py-4 sm:px-6 sm:py-6`}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdText(showJsonLd(show)) }} />
      <div className="overflow-hidden border-y border-l-8 border-band-border bg-paper shadow-card sm:rounded-card sm:border-r">
        <ShowHeader show={show} prev={prev} next={next} />
        <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
          <p className="text-body">{showSummary(show)}</p>
          <section aria-labelledby="setlist" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="setlist" className="text-lead font-semibold text-band-ink">
                Setlist
              </h2>
              {setlist.hasMoreInComplete || view === "complete" ? <ViewSwitch slug={show.slug} view={view} /> : null}
            </div>
            <SetlistView setlist={setlist} />
          </section>
        </div>
      </div>
      <div className={`mt-6 grid grid-cols-1 gap-6 px-4 sm:px-0 ${hasSecondColumn ? "md:grid-cols-2" : ""}`}>
        <div className="flex flex-col gap-6">
          <ShowNotes notes={show.notes} />
          <Footnotes footnotes={setlist.footnotes} />
          <Recordings recordings={show.recordings} />
        </div>
        <StageTalk entries={talk} />
      </div>
    </article>
  );
}

export default function ShowRoute({ params, searchParams }: PageProps<"/shows/[slug]">) {
  return (
    <Suspense fallback={<p className="mx-auto w-full max-w-site p-8">Loading…</p>}>
      <ShowPage params={params} searchParams={searchParams} />
    </Suspense>
  );
}
