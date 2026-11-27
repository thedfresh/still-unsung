"use client";

import { useId, useState } from "react";
import { searchPickerAction } from "@/app/admin/picker-action";
import type { PickerChoice, PickerKind } from "@/lib/data/picker";

const INPUT = "rounded border border-current px-2 py-1";
const BUTTON = "rounded border border-current px-3 py-1";

interface Props {
  kind: PickerKind;
  /** The field name, for example "Work". */
  label: string;
  /** The current choice, or null for none. */
  value: { id: number; label: string } | null;
  onChange: (choice: PickerChoice | null) => void;
  /** What "none" means, shown when nothing is picked. */
  emptyText: string;
  /** False when the field must have a value: no Clear button. */
  clearable?: boolean;
}

/**
 * Pick one record by searching its name. The search is explicit (a button or Enter), so it works
 * at phone width and with a keyboard. Each result shows its hint: a work shows its variants.
 */
export function RecordPicker({ kind, label, value, onChange, emptyText, clearable = true }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [results, setResults] = useState<PickerChoice[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function search() {
    setBusy(true);
    setProblem(null);
    const result = await searchPickerAction({ kind, q: text });
    setBusy(false);
    if (result.ok) setResults(result.data);
    else setProblem(result.error.message);
  }

  function pick(choice: PickerChoice | null) {
    onChange(choice);
    setOpen(false);
    setResults(null);
    setText("");
  }

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p>
        <span className="font-semibold">{label}:</span> {value ? value.label : emptyText}
      </p>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className={BUTTON}>
          {open ? `Close ${label.toLowerCase()} search` : `Find ${label.toLowerCase()}`}
        </button>
        {value && clearable ? (
          <button type="button" onClick={() => pick(null)} className={BUTTON}>
            Clear {label.toLowerCase()}
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-2 rounded border border-current p-3">
          <label htmlFor={id} className="flex flex-col gap-1">
            Search {label.toLowerCase()} by name
            <input
              id={id}
              value={text}
              maxLength={100}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void search();
                }
              }}
              className={INPUT}
            />
          </label>
          <button type="button" onClick={() => void search()} disabled={busy} className={`${BUTTON} self-start`}>
            {busy ? "Searching…" : "Search"}
          </button>
          {problem ? <p role="alert">{problem}</p> : null}
          {results && results.length === 0 ? <p role="status">No match.</p> : null}
          {results && results.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {results.map((choice) => (
                <li key={choice.id} className="min-w-0 break-words">
                  <button type="button" onClick={() => pick(choice)} className={`${BUTTON} text-left`}>
                    Use {choice.label}
                  </button>
                  {choice.hint ? <p className="text-sm">{choice.hint}</p> : null}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
