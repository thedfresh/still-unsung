"use client";

import { useId } from "react";
import { RecordPicker } from "@/components/admin/record-picker";
import { isSpoken, SUMMARY_LIMIT, type SegmentDraft } from "@/lib/shows/edit-edits";
import { INPUT } from "./editor-context";

const DELIVERY = [
  ["", "Default for the work (sung)"],
  ["SUNG", "Sung"],
  ["SUNG_A_CAPPELLA", "Sung a cappella"],
  ["PLAYED", "Played, no words"],
  ["SPOKEN", "Spoken"],
  ["RECORDING_PLAYED", "A recording played"],
] as const;

const EXTENT = [
  ["COMPLETE", "Complete"],
  ["PARTIAL", "Partial"],
  ["FRAGMENT", "Fragment"],
  ["ABORTED", "Aborted (stopped and not finished)"],
] as const;

interface Props {
  draft: SegmentDraft;
  onChange: (draft: SegmentDraft) => void;
  /** The label of the picked work. The form keeps it, because the draft holds only the ID. */
  workLabel: string | null;
  onWorkLabel: (label: string | null) => void;
}

/**
 * The fields of one segment, for a new segment and for an edit. A spoken segment shows no
 * extent or portion. A segment with no work is an unknown song, or talk.
 */
export function SegmentFields({ draft, onChange, workLabel, onWorkLabel }: Props) {
  const id = useId();
  const set = (patch: Partial<SegmentDraft>) => onChange({ ...draft, ...patch });
  const spoken = isSpoken(draft.delivery);
  return (
    <div className="flex flex-col gap-3">
      <RecordPicker
        kind="work"
        label="Work"
        value={draft.workId === null ? null : { id: draft.workId, label: workLabel ?? "" }}
        emptyText="No work (unknown song, or talk)"
        onChange={(choice) => {
          onWorkLabel(choice?.label ?? null);
          set({ workId: choice?.id ?? null });
        }}
      />
      <label className="flex flex-col gap-1">
        Delivery
        <select value={draft.delivery} onChange={(e) => set({ delivery: e.target.value })} className={INPUT}>
          {DELIVERY.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      {spoken ? null : (
        <>
          <label className="flex flex-col gap-1">
            Extent
            <select value={draft.extent} onChange={(e) => set({ extent: e.target.value })} className={INPUT}>
              {EXTENT.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Portion note (for example, last verse only)
            <input value={draft.portionNote} onChange={(e) => set({ portionNote: e.target.value })} className={INPUT} />
          </label>
        </>
      )}
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={draft.joinsNext} onChange={(e) => set({ joinsNext: e.target.checked })} />
        Runs into the next segment (segue)
      </label>
      <label className="flex flex-col gap-1">
        Summary
        <textarea
          value={draft.summary}
          onChange={(e) => set({ summary: e.target.value })}
          maxLength={SUMMARY_LIMIT}
          rows={3}
          aria-describedby={`${id}-count`}
          className={INPUT}
        />
      </label>
      <p id={`${id}-count`}>
        {draft.summary.trim().length} of {SUMMARY_LIMIT} characters
      </p>
    </div>
  );
}
