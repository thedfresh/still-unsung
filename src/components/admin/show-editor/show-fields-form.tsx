"use client";

import { useState } from "react";
import { RecordPicker } from "@/components/admin/record-picker";
import { draftOfShow, showFieldsEdit, type ShowDraft } from "@/lib/shows/edit-edits";
import type { ShowEditData } from "@/lib/shows/edit-types";
import { FIELD, INPUT, PRIMARY, SECTION_CARD, useEditor } from "./editor-context";

const STATUS = [
  ["TOOK_PLACE", "Took place"],
  ["CANCELED", "Canceled"],
  ["SPURIOUS", "Spurious (never happened)"],
  ["UNKNOWN", "Not known"],
] as const;

/** The show's own fields: date, place and its name, band, billed as, status. One save for the form. */
export function ShowFieldsForm({ show }: { show: ShowEditData }) {
  const { send, pending } = useEditor();
  const [draft, setDraft] = useState<ShowDraft>(() => draftOfShow(show));
  // The names of the place now picked. A new place starts with its latest name (item 81).
  const [names, setNames] = useState(show.place?.names ?? []);
  const [placeLabel, setPlaceLabel] = useState(show.place?.label ?? null);
  const [bandLabel, setBandLabel] = useState(show.band?.label ?? null);
  const set = (patch: Partial<ShowDraft>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <form
      aria-labelledby="show-fields"
      className={`${SECTION_CARD} flex flex-col gap-3`}
      onSubmit={(event) => {
        event.preventDefault();
        send(showFieldsEdit(show, draft));
      }}
    >
      <h2 id="show-fields" className="text-xl font-semibold">
        The show
      </h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="font-semibold">Date (leave out what is not known)</legend>
        <div className="flex flex-wrap gap-3">
          <label className={FIELD}>
            Year
            <input inputMode="numeric" value={draft.year} onChange={(e) => set({ year: e.target.value })} className={`${INPUT} max-w-24`} />
          </label>
          <label className={FIELD}>
            Month
            <input inputMode="numeric" value={draft.month} onChange={(e) => set({ month: e.target.value })} className={`${INPUT} max-w-20`} />
          </label>
          <label className={FIELD}>
            Day
            <input inputMode="numeric" value={draft.day} onChange={(e) => set({ day: e.target.value })} className={`${INPUT} max-w-20`} />
          </label>
        </div>
        <label className={FIELD}>
          Date as written (optional)
          <input value={draft.dateAsWritten} onChange={(e) => set({ dateAsWritten: e.target.value })} className={INPUT} />
        </label>
      </fieldset>
      <RecordPicker
        kind="place"
        label="Place"
        value={draft.placeId === null ? null : { id: draft.placeId, label: placeLabel ?? "" }}
        emptyText="No place"
        onChange={(choice) => {
          if (!choice) {
            setNames([]);
            setPlaceLabel(null);
            return set({ placeId: null, placeNameId: null });
          }
          const list = choice.names ?? [];
          setNames(list);
          setPlaceLabel(choice.label);
          set({ placeId: choice.id, placeNameId: list.at(-1)?.id ?? null });
        }}
      />
      {draft.placeId !== null ? (
        <label className={FIELD}>
          Place name used by this show
          <select
            value={draft.placeNameId ?? ""}
            onChange={(e) => set({ placeNameId: e.target.value === "" ? null : Number(e.target.value) })}
            className={INPUT}
          >
            {names.map((name) => (
              <option key={name.id} value={name.id}>
                {name.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className={FIELD}>
        Billed as (what a flyer printed, if it differs)
        <input value={draft.billedAs} onChange={(e) => set({ billedAs: e.target.value })} className={INPUT} />
      </label>
      <RecordPicker
        kind="band"
        label="Band"
        value={draft.bandId === null ? null : { id: draft.bandId, label: bandLabel ?? "" }}
        emptyText="No band"
        onChange={(choice) => {
          setBandLabel(choice?.label ?? null);
          set({ bandId: choice?.id ?? null });
        }}
      />
      <label className={FIELD}>
        Status
        <select value={draft.status} onChange={(e) => set({ status: e.target.value })} className={INPUT}>
          {STATUS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={pending} className={`${PRIMARY} self-start`}>
        {pending ? "Saving…" : "Save the show"}
      </button>
    </form>
  );
}
