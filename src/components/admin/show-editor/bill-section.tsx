"use client";

import { useState } from "react";
import { RecordPicker } from "@/components/admin/record-picker";
import { addBillEdit, moveBillEdits, removeBillEdit, updateBillEdit, type BillDraft } from "@/lib/shows/edit-edits";
import type { EditBillEntry, ShowEditData } from "@/lib/shows/edit-types";
import { BUTTON, INPUT, SECTION_CARD, useEditor } from "./editor-context";

const ROLES = [
  ["HEADLINER", "Headliner"],
  ["OPENER", "Opener"],
  ["CO_BILL", "Co-bill"],
] as const;
const CERTAINTY = [
  ["CONFIRMED", "Confirmed"],
  ["PROBABLE", "Probable"],
  ["POSSIBLE", "Possible"],
  ["UNKNOWN", "Not known"],
] as const;

function Choices({ options, value, onChange, label }: { options: ReadonlyArray<readonly [string, string]>; value: string; onChange: (v: string) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <select value={value} onChange={(e) => onChange(e.target.value)} className={INPUT}>
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function BillRow({ entry, bill, first, last }: { entry: EditBillEntry; bill: EditBillEntry[]; first: boolean; last: boolean }) {
  const { send, pending } = useEditor();
  const [role, setRole] = useState(entry.role);
  const [certainty, setCertainty] = useState(entry.certainty);
  return (
    <li className={`${SECTION_CARD} flex flex-col gap-2`}>
      <p className="font-semibold">{entry.actName}</p>
      <div className="flex flex-wrap gap-3">
        <Choices label={`Role of ${entry.actName}`} options={ROLES} value={role} onChange={setRole} />
        <Choices label={`Certainty of ${entry.actName}`} options={CERTAINTY} value={certainty} onChange={setCertainty} />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={BUTTON} onClick={() => send(updateBillEdit(entry, role, certainty))}>
          Save {entry.actName}
        </button>
        <button type="button" disabled={pending || first} className={BUTTON} onClick={() => send(moveBillEdits(bill, entry.id, -1))}>
          Move up {entry.actName}
        </button>
        <button type="button" disabled={pending || last} className={BUTTON} onClick={() => send(moveBillEdits(bill, entry.id, 1))}>
          Move down {entry.actName}
        </button>
        <button type="button" disabled={pending} className={BUTTON} onClick={() => send(removeBillEdit(entry))}>
          Remove {entry.actName}
        </button>
      </div>
    </li>
  );
}

/** The bill of the show: one ordered list of acts, with role and certainty (item 82). */
export function BillSection({ show }: { show: ShowEditData }) {
  const { send, pending } = useEditor();
  const [draft, setDraft] = useState<BillDraft>({ act: null, role: "HEADLINER", certainty: "CONFIRMED" });
  const [actKind, setActKind] = useState<"band" | "person">("band");
  const [actLabel, setActLabel] = useState("");
  return (
    <section aria-labelledby="bill" className="flex flex-col gap-3">
      <h2 id="bill" className="text-xl font-semibold">
        The bill
      </h2>
      {show.bill.length === 0 ? (
        <p>No acts on the bill.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {show.bill.map((entry, index) => (
            <BillRow key={`${entry.id}-${entry.rev}`} entry={entry} bill={show.bill} first={index === 0} last={index === show.bill.length - 1} />
          ))}
        </ol>
      )}
      <form
        aria-labelledby="add-act"
        className={`${SECTION_CARD} flex flex-col gap-3`}
        onSubmit={(event) => {
          event.preventDefault();
          send(addBillEdit(show.id, show.bill, draft), () => {
            setDraft({ act: null, role: "HEADLINER", certainty: "CONFIRMED" });
            setActLabel("");
          });
        }}
      >
        <h3 id="add-act" className="font-semibold">
          Add an act
        </h3>
        <Choices
          label="The act is"
          options={[
            ["band", "A band"],
            ["person", "A person"],
          ]}
          value={actKind}
          onChange={(v) => {
            setActKind(v as "band" | "person");
            setDraft({ ...draft, act: null });
            setActLabel("");
          }}
        />
        <RecordPicker
          key={actKind}
          kind={actKind}
          label="Act"
          value={draft.act ? { id: draft.act.id, label: actLabel } : null}
          emptyText="Nobody picked yet"
          onChange={(choice) => {
            setActLabel(choice?.label ?? "");
            setDraft({ ...draft, act: choice ? { kind: actKind, id: choice.id } : null });
          }}
        />
        <Choices label="Role" options={ROLES} value={draft.role} onChange={(role) => setDraft({ ...draft, role })} />
        <Choices label="Certainty" options={CERTAINTY} value={draft.certainty} onChange={(certainty) => setDraft({ ...draft, certainty })} />
        <button type="submit" disabled={pending} className={`${BUTTON} self-start`}>
          {pending ? "Saving…" : "Add to the bill"}
        </button>
      </form>
    </section>
  );
}
