"use client";

import { useId } from "react";
import { OTHER_LABEL, type EvidenceChoice } from "@/lib/evidence-choice";
import type { RecentEvidence } from "@/lib/data/changes/admin-save";

interface Props {
  value: EvidenceChoice;
  onChange: (choice: EvidenceChoice) => void;
  /** The user's most recent choices (at most five), each one click. */
  recent: RecentEvidence[];
}

const INPUT = "rounded border border-current px-2 py-1";

/**
 * The evidence of a save, named once: "my own knowledge" (the quick choice), a recent choice,
 * or a source, recording or contributor by ID. A save always has one.
 */
export function EvidencePicker({ value, onChange, recent }: Props) {
  const name = useId();
  const other = value.kind === "other" ? value : null;
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="font-semibold">Evidence for this change</legend>
      <label className="flex items-center gap-2">
        <input type="radio" name={name} checked={value.kind === "own"} onChange={() => onChange({ kind: "own" })} />
        My own knowledge
      </label>
      {recent.map((choice) => (
        <label key={choice.label} className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            checked={value.kind === "recent" && JSON.stringify(value.evidence) === JSON.stringify(choice.evidence)}
            onChange={() => onChange({ kind: "recent", evidence: choice.evidence })}
          />
          {choice.label}
        </label>
      ))}
      <label className="flex items-center gap-2">
        <input
          type="radio"
          name={name}
          checked={other !== null}
          onChange={() => onChange({ kind: "other", type: "source", id: "", place: "" })}
        />
        A source, a recording or a contributor
      </label>
      {other ? (
        <div className="ml-6 flex flex-col gap-2">
          <label className="flex flex-col gap-1">
            Kind
            <select value={other.type} onChange={(e) => onChange({ ...other, type: e.target.value as typeof other.type })} className={INPUT}>
              {(Object.keys(OTHER_LABEL) as Array<keyof typeof OTHER_LABEL>).map((type) => (
                <option key={type} value={type}>
                  {OTHER_LABEL[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            {OTHER_LABEL[other.type]} ID
            <input inputMode="numeric" value={other.id} onChange={(e) => onChange({ ...other, id: e.target.value })} className={INPUT} />
          </label>
          <label className="flex flex-col gap-1">
            Page or time (optional)
            <input value={other.place} maxLength={500} onChange={(e) => onChange({ ...other, place: e.target.value })} className={INPUT} />
          </label>
        </div>
      ) : null}
    </fieldset>
  );
}
