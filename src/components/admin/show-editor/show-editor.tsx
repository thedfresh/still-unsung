"use client";

import { useState } from "react";
import { saveAdminChangesAction } from "@/app/admin/save-action";
import { EvidencePicker } from "@/components/admin/evidence-picker";
import { SaveProblems } from "@/components/admin/save-problems";
import { useAdminSave } from "@/components/admin/use-admin-save";
import type { RecentEvidence } from "@/lib/data/changes/admin-save";
import { evidenceOf, OWN_KNOWLEDGE, type EvidenceChoice } from "@/lib/evidence-choice";
import type { Built } from "@/lib/shows/edit-edits";
import type { ShowEditData } from "@/lib/shows/edit-types";
import { BillSection } from "./bill-section";
import { EditorProvider } from "./editor-context";
import { NotesSection } from "./notes-section";
import { SetsSection } from "./sets-section";
import { ShowFieldsForm } from "./show-fields-form";

const choiceWords = (choice: EvidenceChoice) =>
  choice.kind === "own" ? "my own knowledge" : choice.kind === "recent" ? "a recent choice" : "a source, recording or contributor";

/**
 * The show editor. It holds the one evidence choice for the page and the one save state. Every
 * part saves through `send`, which calls the shared admin save: one changeset for each save.
 */
export function ShowEditor({ show, recent }: { show: ShowEditData; recent: RecentEvidence[] }) {
  const [choice, setChoice] = useState<EvidenceChoice>(OWN_KNOWLEDGE);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useAdminSave(saveAdminChangesAction);

  function send(built: Built, done?: () => void) {
    if ("error" in built) return setFormError(built.error);
    if (built.edits.length === 0) return setFormError("Nothing changed.");
    const picked = evidenceOf(choice);
    if ("error" in picked) return setFormError(picked.error);
    setFormError(null);
    form.save({ edits: built.edits, evidence: picked.evidence }, done);
  }

  const problems = [...(formError ? [formError] : []), ...form.messages];
  return (
    <EditorProvider value={{ pending: form.pending, send, fail: setFormError }}>
      <div className="flex flex-col gap-6">
        <details className="rounded-card border border-line bg-surface p-3">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold">Evidence for every change on this page: {choiceWords(choice)}</summary>
          <div className="mt-3 flex flex-col gap-2">
            <p>Each save names its evidence. The choice stays until you change it.</p>
            <EvidencePicker value={choice} onChange={setChoice} recent={recent} />
          </div>
        </details>
        <ShowFieldsForm key={`fields-${show.rev}`} show={show} />
        <BillSection show={show} />
        <SetsSection show={show} />
        <NotesSection show={show} />
        <div className="sticky bottom-0 z-10 bg-paper text-ink">
          <SaveProblems messages={problems} conflicts={form.conflicts} />
        </div>
      </div>
    </EditorProvider>
  );
}
