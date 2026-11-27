"use client";

import { useState } from "react";
import { ListFields } from "@/components/admin/lists/list-fields";
import { Badge } from "@/components/admin/ui/components";
import { BUTTON_CLASS, ROW_CLASS } from "@/components/admin/ui/styles";
import type { ListRow as Row } from "@/lib/data/lists";
import type { ListConfig } from "@/lib/lists/config";
import { checkValues, updateEdit, type ListValues } from "@/lib/lists/edits";

const BUTTON = BUTTON_CLASS.secondary;

interface Props {
  config: ListConfig;
  row: Row;
  first: boolean;
  last: boolean;
  busy: boolean;
  /** Send one edit to the shared save. `done` runs after a successful save. */
  send: (edit: object, done?: () => void) => void;
  move: (direction: -1 | 1) => void;
  /** Report a problem in the form before any save starts. */
  fail: (message: string) => void;
}

function show(value: string | boolean | null | undefined): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return value === null || value === undefined || value === "" ? "not set" : value;
}

/** One value of a list: its fields, how many records use it, and the controls to change it. */
export function ListRowView({ config, row, first, last, busy, send, move, fail }: Props) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [draft, setDraft] = useState<ListValues>(row.values);
  const name = String(row.values.name);

  function save(event: React.FormEvent) {
    event.preventDefault();
    const problem = checkValues(config, draft);
    if (problem) return fail(problem);
    const edit = updateEdit(config, row, draft);
    if (!edit) return setEditing(false);
    send(edit, () => setEditing(false));
  }

  if (editing) {
    return (
      <li className={ROW_CLASS}>
        <form onSubmit={save} aria-label={`Edit ${name}`} className="flex flex-col gap-3">
          <ListFields config={config} values={draft} onChange={setDraft} idPrefix={`edit-${row.id}`} stored={row.values} />
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={busy} aria-busy={busy || undefined} className={BUTTON_CLASS.primary}>
              {busy ? "Saving…" : "Save"}
            </button>
            <button type="button" disabled={busy} onClick={() => setEditing(false)} className={BUTTON}>
              Cancel
            </button>
          </div>
        </form>
      </li>
    );
  }

  return (
    <li className={ROW_CLASS}>
      <p className="break-words text-lead font-semibold">{name}</p>
      <dl className="break-words">
        {config.fields.slice(1).map((field) => (
          <div key={field.name} className="flex flex-wrap gap-x-2">
            <dt>{field.label}:</dt>
            <dd>{show(row.values[field.name])}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <button type="button" disabled={busy || first} onClick={() => move(-1)} aria-label={`Move up ${name}`} className={BUTTON}>
          Move up
        </button>
        <button type="button" disabled={busy || last} onClick={() => move(1)} aria-label={`Move down ${name}`} className={BUTTON}>
          Move down
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setDraft(row.values);
            setEditing(true);
          }}
          aria-label={`Edit ${name}`}
          className={BUTTON}
        >
          Edit
        </button>
        {row.usedBy > 0 ? (
          <Badge>
            In use by {row.usedBy} {row.usedBy === 1 ? "record" : "records"}
          </Badge>
        ) : confirming ? (
          <>
            <button type="button" disabled={busy} onClick={() => send({ op: "delete", type: config.type, id: row.id, rev: row.rev })} aria-label={`Confirm delete ${name}`} className={BUTTON_CLASS.danger}>
              Confirm delete
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={BUTTON}>
              Keep
            </button>
          </>
        ) : (
          <button type="button" disabled={busy} onClick={() => setConfirming(true)} aria-label={`Delete ${name}`} className={BUTTON}>
            Delete
          </button>
        )}
      </div>
    </li>
  );
}
