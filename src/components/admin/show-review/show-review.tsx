import type { ReviewSet, ReviewShow } from "@/lib/data/shows/review-types";
import { Attachments, CARD, Facts, Lines, Origin } from "./parts";
import { SegmentCard } from "./segment-card";

function SetSection({ set }: { set: ReviewSet }) {
  return (
    <section id={`set-${set.id}`} aria-labelledby={`set-${set.id}-title`} className="flex flex-col gap-3">
      <h2 id={`set-${set.id}-title`} className="text-xl font-semibold">
        Set {set.position}: {set.setType}
      </h2>
      <Origin text={set.origin} />
      <Facts items={[["Why it is incomplete", set.incompleteReason], ["Band for this set", set.band]]} />
      <Lines title="Lineup for this set" lines={set.lineup} level={3} />
      <Attachments data={set.attachments} level={3} />
      {set.segments.length === 0 ? (
        <p>No segments in this set.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {set.segments.map((segment) => (
            <SegmentCard key={segment.id} segment={segment} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** One show on one page, read-only: the header, then the sets and their segments in order. */
export function ShowReviewView({ show }: { show: ReviewShow }) {
  return (
    <>
      <section aria-labelledby="show-header" className={`${CARD} flex flex-col gap-2`}>
        <h2 id="show-header" className="text-xl font-semibold">
          The show
        </h2>
        <Origin text={show.origin} />
        <Facts
          items={[
            ["Date", show.date],
            ["Time", show.timeLabel],
            ["Place", show.place],
            ["Place name used", show.placeName],
            ["Billed as", show.billedAs],
            ["Band", show.band],
            ["Show type", show.showType],
            ["Status", show.status],
          ]}
        />
        <Lines title="The bill" lines={show.bill} level={3} />
        <Lines title="Lineup (exceptions only, as stored)" lines={show.lineup} level={3} />
        <Lines title="Recordings" lines={show.recordings} level={3} />
        <Attachments data={show.attachments} level={3} />
      </section>
      {show.sets.length === 0 ? <p>This show has no sets.</p> : show.sets.map((set) => <SetSection key={set.id} set={set} />)}
    </>
  );
}
