"use client";

import { useState } from "react";
import { RecordLink } from "@/components/admin/ui/components";
import { adminHref } from "@/lib/record-links";
import {
  draftOfSegment,
  moveSegmentEdit,
  nestSegmentEdit,
  unnestSegmentEdit,
  updateSegmentEdit,
  type SegmentDraft,
} from "@/lib/shows/edit-edits";
import type { EditSegment } from "@/lib/shows/edit-types";
import { BUTTON, PRIMARY, SECTION_CARD, useEditor } from "./editor-context";
import { SegmentFields } from "./segment-fields";

const DELIVERY_WORDS: Record<string, string> = {
  SUNG: "sung",
  SUNG_A_CAPPELLA: "sung a cappella",
  PLAYED: "played, no words",
  SPOKEN: "spoken",
  RECORDING_PLAYED: "a recording played",
};

/** The one-line name of a segment, for button names. */
export const segmentName = (segment: EditSegment) => `segment ${segment.number}${segment.workTitle ? ` ${segment.workTitle}` : ""}`;

function EditForm({ segment, onClose }: { segment: EditSegment; onClose: () => void }) {
  const { send, pending } = useEditor();
  const [draft, setDraft] = useState<SegmentDraft>(() => draftOfSegment(segment));
  const [workLabel, setWorkLabel] = useState(segment.workTitle);
  return (
    <form
      aria-label={`Edit ${segmentName(segment)}`}
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        send(updateSegmentEdit(segment, draft), onClose);
      }}
    >
      <SegmentFields draft={draft} onChange={setDraft} workLabel={workLabel} onWorkLabel={setWorkLabel} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending} className={PRIMARY}>
          {pending ? "Saving…" : `Save ${segmentName(segment)}`}
        </button>
        <button type="button" onClick={onClose} disabled={pending} className={BUTTON}>
          Cancel
        </button>
      </div>
    </form>
  );
}

/** One segment of a set: its facts, the move buttons and an inline edit form. Children are indented. */
export function SegmentRow({ segment, all, firstSibling, lastSibling }: { segment: EditSegment; all: EditSegment[]; firstSibling: boolean; lastSibling: boolean }) {
  const { send, pending } = useEditor();
  // The form closes when the page reads the new version: its key changes with `rev`.
  const [editing, setEditing] = useState(false);
  const name = segmentName(segment);
  const facts = [
    segment.delivery ? DELIVERY_WORDS[segment.delivery] : null,
    segment.extent !== "COMPLETE" ? segment.extent.toLowerCase() : null,
    segment.portionNote,
    segment.joinsNext ? "runs into the next" : null,
  ].filter(Boolean);
  return (
    <li id={`segment-${segment.id}`} style={{ marginInlineStart: `${segment.depth * 1.25}rem` }} className="list-none">
      <article className={`${SECTION_CARD} flex flex-col gap-2`} aria-label={name}>
        <h4 className="text-lg font-semibold">
          {segment.number}.{" "}
          {segment.workTitle ? <RecordLink href={segment.workId === null ? null : adminHref("Work", segment.workId)}>{segment.workTitle}</RecordLink> : "No work"}
        </h4>
        {facts.length > 0 ? <p>{facts.join("; ")}</p> : null}
        {segment.summary ? <p className="whitespace-pre-wrap">{segment.summary}</p> : null}
        {editing ? (
          <EditForm key={segment.rev} segment={segment} onClose={() => setEditing(false)} />
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BUTTON} onClick={() => setEditing(true)} aria-label={`Edit ${name}`}>
              Edit
            </button>
            <button type="button" className={BUTTON} disabled={pending || firstSibling} aria-label={`Move up ${name}`} onClick={() => send(moveSegmentEdit(all, segment.id, -1))}>
              Up
            </button>
            <button type="button" className={BUTTON} disabled={pending || lastSibling} aria-label={`Move down ${name}`} onClick={() => send(moveSegmentEdit(all, segment.id, 1))}>
              Down
            </button>
            <button type="button" className={BUTTON} disabled={pending || firstSibling} aria-label={`Nest ${name} inside the segment before it`} onClick={() => send(nestSegmentEdit(all, segment.id))}>
              Nest
            </button>
            <button type="button" className={BUTTON} disabled={pending || segment.parentId === null} aria-label={`Unnest ${name}, out of its container`} onClick={() => send(unnestSegmentEdit(all, segment.id))}>
              Unnest
            </button>
          </div>
        )}
      </article>
    </li>
  );
}
