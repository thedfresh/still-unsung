import type { ReviewSegment } from "@/lib/data/shows/review-types";
import type { RecentEvidence } from "@/lib/data/changes/admin-save";
import { Attachments, CARD, Facts, linked, Lines, Origin } from "./parts";
import { SummaryEditor } from "./summary-editor";

/** One segment: its facts, its summary in full, and what hangs under it. Children are indented. */
export function SegmentCard({ segment, recent }: { segment: ReviewSegment; recent: RecentEvidence[] }) {
  return (
    <li id={`segment-${segment.id}`} style={{ marginInlineStart: `${segment.depth * 1.25}rem` }} className="list-none">
      <article className={`${CARD} flex flex-col gap-2`} aria-labelledby={`segment-${segment.id}-title`}>
        <h3 id={`segment-${segment.id}-title`} className="text-lg font-semibold">
          {segment.number}. {linked(segment.work, segment.workHref)}
          {segment.joinMark ? (
            <span>
              {" "}
              {segment.joinMark}
              <span className="sr-only"> (runs into the next segment)</span>
            </span>
          ) : null}
        </h3>
        <Origin text={segment.origin} />
        <Facts
          items={[
            ["Delivery", segment.delivery],
            ["Words from", linked(segment.wordsFrom, segment.wordsFromHref)],
            ["Tune from", linked(segment.tuneFrom, segment.tuneFromHref)],
            ["Extent", segment.extent],
            ["Portion", segment.portionNote],
            ["Cuts", segment.cuts.join(", ")],
            ["Delivered by", linked(segment.deliveredBy, segment.deliveredByHref)],
          ]}
        />
        <SummaryEditor
          segmentId={segment.id}
          label={`segment ${segment.number}`}
          rev={segment.rev}
          summary={segment.summary}
          recent={recent}
        />
        {segment.wordsAsHeard ? (
          <section className="flex flex-col gap-1">
            <h4 className="font-semibold">Words as heard{segment.wordsPublic ? "" : " (private)"}</h4>
            <p className="whitespace-pre-wrap">{segment.wordsAsHeard}</p>
          </section>
        ) : null}
        <Lines title="Singers" lines={segment.vocals} level={4} />
        <Lines title="Lineup for this segment" lines={segment.lineup} level={4} />
        <Attachments data={segment.attachments} />
      </article>
    </li>
  );
}
