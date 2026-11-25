import type { ReviewSegment } from "@/lib/data/shows/review-types";
import { Attachments, CARD, Facts, Lines, Origin } from "./parts";

/** One segment: its facts, its summary in full, and what hangs under it. Children are indented. */
export function SegmentCard({ segment }: { segment: ReviewSegment }) {
  return (
    <li id={`segment-${segment.id}`} style={{ marginInlineStart: `${segment.depth * 1.25}rem` }} className="list-none">
      <article className={`${CARD} flex flex-col gap-2`} aria-labelledby={`segment-${segment.id}-title`}>
        <h3 id={`segment-${segment.id}-title`} className="text-lg font-semibold">
          {segment.number}. {segment.work}
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
            ["Words from", segment.wordsFrom],
            ["Tune from", segment.tuneFrom],
            ["Extent", segment.extent],
            ["Portion", segment.portionNote],
            ["Cuts", segment.cuts.join(", ")],
            ["Delivered by", segment.deliveredBy],
          ]}
        />
        {segment.summary ? (
          <section className="flex flex-col gap-1">
            <h4 className="font-semibold">Summary</h4>
            <p className="whitespace-pre-wrap">{segment.summary}</p>
          </section>
        ) : null}
        {segment.wordsAsHeard ? (
          <section className="flex flex-col gap-1">
            <h4 className="font-semibold">Words as heard (private)</h4>
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
