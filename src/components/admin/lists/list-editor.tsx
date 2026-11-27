"use client";

import { useState } from "react";
import { saveAdminChangesAction } from "@/app/admin/save-action";
import { EvidencePicker } from "@/components/admin/evidence-picker";
import { ListFields } from "@/components/admin/lists/list-fields";
import { ListRowView } from "@/components/admin/lists/list-row";
import { SaveProblems } from "@/components/admin/save-problems";
import { Button } from "@/components/admin/ui/components";
import { useAdminSave } from "@/components/admin/use-admin-save";
import type { RecentEvidence } from "@/lib/data/changes/admin-save";
import type { ListRow } from "@/lib/data/lists";
import { evidenceOf, OWN_KNOWLEDGE, type EvidenceChoice } from "@/lib/evidence-choice";
import type { ListConfig } from "@/lib/lists/config";
import { blankValues, checkValues, createEdit, moveEdits } from "@/lib/lists/edits";

interface Props {
  config: ListConfig;
  rows: ListRow[];
  recent: RecentEvidence[];
}

/**
 * One list page: the values in order, a form to add one, and one evidence choice for every
 * change made here. Every change is one save through the shared admin save.
 */
export function ListEditor({ config, rows, recent }: Props) {
  const [choice, setChoice] = useState<EvidenceChoice>(OWN_KNOWLEDGE);
  const [formError, setFormError] = useState<string | null>(null);
  const [draft, setDraft] = useState(() => blankValues(config));
  const form = useAdminSave(saveAdminChangesAction);

  /** Send edits to the shared save with the chosen evidence. */
  function send(edits: object[], done?: () => void) {
    const picked = evidenceOf(choice);
    if ("error" in picked) return setFormError(picked.error);
    setFormError(null);
    form.save({ edits, evidence: picked.evidence }, done);
  }

  function add(event: React.FormEvent) {
    event.preventDefault();
    const problem = checkValues(config, draft);
    if (problem) return setFormError(problem);
    const next = rows.reduce((max, row) => Math.max(max, row.position), 0) + 1;
    send([createEdit(config, draft, next)], () => setDraft(blankValues(config)));
  }

  const problems = [...(formError ? [formError] : []), ...form.messages];
  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="evidence" className="flex flex-col gap-2">
        <h2 id="evidence" className="text-xl font-semibold">
          Evidence
        </h2>
        <p>Every change on this page names its evidence. The choice stays until you change it.</p>
        <EvidencePicker value={choice} onChange={setChoice} recent={recent} />
      </section>
      <SaveProblems messages={problems} conflicts={form.conflicts} />
      <section aria-labelledby="values" className="flex flex-col gap-3">
        <h2 id="values" className="text-xl font-semibold">
          Values
        </h2>
        {rows.length === 0 ? (
          <p>This list has no values yet.</p>
        ) : (
          <ol className="flex flex-col gap-3">
            {rows.map((row, index) => (
              <ListRowView
                key={`${row.id}-${row.rev}`}
                config={config}
                row={row}
                first={index === 0}
                last={index === rows.length - 1}
                busy={form.pending}
                send={(edit, done) => send([edit], done)}
                move={(direction) => send(moveEdits(config, rows, row.id, direction))}
                fail={setFormError}
              />
            ))}
          </ol>
        )}
      </section>
      <section aria-labelledby="add" className="flex flex-col gap-3">
        <h2 id="add" className="text-xl font-semibold">
          Add a {config.label}
        </h2>
        <form onSubmit={add} aria-labelledby="add" className="flex flex-col gap-3">
          <ListFields config={config} values={draft} onChange={setDraft} idPrefix="add" />
          <Button type="submit" variant="primary" busy={form.pending} className="self-start">
            {form.pending ? "Saving…" : `Add ${config.label}`}
          </Button>
        </form>
      </section>
    </div>
  );
}
