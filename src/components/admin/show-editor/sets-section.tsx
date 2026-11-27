"use client";

import { useState } from "react";
import {
  addSegmentEdit,
  addSetEdit,
  BLANK_SEGMENT,
  moveSetEdits,
  parsePlacement,
  setTypeEdit,
  siblingsOf,
  type SegmentDraft,
} from "@/lib/shows/edit-edits";
import type { EditChoice, EditSet, ShowEditData } from "@/lib/shows/edit-types";
import { BUTTON, INPUT, SECTION_CARD, useEditor } from "./editor-context";
import { SegmentFields } from "./segment-fields";
import { SegmentRow, segmentName } from "./segment-row";

function AddSegmentForm({ set }: { set: EditSet }) {
  const { send, pending } = useEditor();
  const [draft, setDraft] = useState<SegmentDraft>(BLANK_SEGMENT);
  const [workLabel, setWorkLabel] = useState<string | null>(null);
  const [where, setWhere] = useState("end");
  const label = `set ${set.position}`;
  return (
    <form
      aria-label={`Add a segment to ${label}`}
      className={`${SECTION_CARD} flex flex-col gap-3`}
      onSubmit={(event) => {
        event.preventDefault();
        send(addSegmentEdit(set.id, set.segments, parsePlacement(where), draft), () => {
          setDraft(BLANK_SEGMENT);
          setWorkLabel(null);
          setWhere("end");
        });
      }}
    >
      <h4 className="font-semibold">Add a segment to {label}</h4>
      <label className="flex flex-col gap-1">
        Where
        <select value={where} onChange={(e) => setWhere(e.target.value)} className={INPUT}>
          <option value="end">At the end of the set</option>
          {set.segments.flatMap((segment) => [
            <option key={`after-${segment.id}`} value={`after:${segment.id}`}>
              After {segmentName(segment)}
            </option>,
            <option key={`inside-${segment.id}`} value={`inside:${segment.id}`}>
              Inside {segmentName(segment)} (as its last part)
            </option>,
          ])}
        </select>
      </label>
      <SegmentFields draft={draft} onChange={setDraft} workLabel={workLabel} onWorkLabel={setWorkLabel} />
      <button type="submit" disabled={pending} className={`${BUTTON} self-start`}>
        {pending ? "Saving…" : `Add segment to ${label}`}
      </button>
    </form>
  );
}

function SetHeader({ set, sets, setTypes, index }: { set: EditSet; sets: EditSet[]; setTypes: EditChoice[]; index: number }) {
  const { send, pending } = useEditor();
  const [typeId, setTypeId] = useState(set.setTypeId);
  return (
    <div className="flex flex-col gap-2">
      <h3 id={`set-${set.id}-title`} className="text-lg font-semibold">
        Set {set.position}: {set.setTypeName}
      </h3>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          Set type of set {set.position}
          <select value={typeId} onChange={(e) => setTypeId(Number(e.target.value))} className={INPUT}>
            {setTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" disabled={pending} className={BUTTON} onClick={() => send(setTypeEdit(set, typeId))}>
          Save set type of set {set.position}
        </button>
        <button type="button" disabled={pending || index === 0} className={BUTTON} onClick={() => send(moveSetEdits(sets, set.id, -1))}>
          Move set {set.position} up
        </button>
        <button type="button" disabled={pending || index === sets.length - 1} className={BUTTON} onClick={() => send(moveSetEdits(sets, set.id, 1))}>
          Move set {set.position} down
        </button>
      </div>
    </div>
  );
}

/** The sets of the show, each with its segments in order, and a form to add a set. */
export function SetsSection({ show }: { show: ShowEditData }) {
  const { send, pending } = useEditor();
  const [newType, setNewType] = useState(show.setTypes[0]?.id ?? 0);
  return (
    <section aria-labelledby="sets" className="flex flex-col gap-4">
      <h2 id="sets" className="text-xl font-semibold">
        Sets and segments
      </h2>
      {show.sets.length === 0 ? <p>This show has no sets.</p> : null}
      {show.sets.map((set, index) => (
        <section key={`${set.id}-${set.rev}`} aria-labelledby={`set-${set.id}-title`} className="flex flex-col gap-3">
          <SetHeader set={set} sets={show.sets} setTypes={show.setTypes} index={index} />
          {set.segments.length === 0 ? (
            <p>No segments in this set.</p>
          ) : (
            <ol className="flex flex-col gap-3">
              {set.segments.map((segment) => {
                const siblings = siblingsOf(set.segments, segment.parentId);
                return (
                  <SegmentRow
                    key={segment.id}
                    segment={segment}
                    all={set.segments}
                    firstSibling={siblings[0]?.id === segment.id}
                    lastSibling={siblings.at(-1)?.id === segment.id}
                  />
                );
              })}
            </ol>
          )}
          <AddSegmentForm key={`add-${set.id}-${set.segments.length}`} set={set} />
        </section>
      ))}
      <form
        aria-labelledby="add-set"
        className={`${SECTION_CARD} flex flex-col gap-3`}
        onSubmit={(event) => {
          event.preventDefault();
          send(addSetEdit(show, newType));
        }}
      >
        <h3 id="add-set" className="font-semibold">
          Add a set
        </h3>
        <label className="flex flex-col gap-1">
          Set type
          <select value={newType} onChange={(e) => setNewType(Number(e.target.value))} className={INPUT}>
            {show.setTypes.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={pending || show.setTypes.length === 0} className={`${BUTTON} self-start`}>
          {pending ? "Saving…" : "Add the set"}
        </button>
      </form>
    </section>
  );
}
