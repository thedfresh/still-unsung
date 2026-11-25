"use client";

import { useState } from "react";
import { saveAdminChangesAction } from "@/app/admin/save-action";
import { EvidencePicker } from "@/components/admin/evidence-picker";
import { useAdminSave } from "@/components/admin/use-admin-save";
import type { RecentEvidence } from "@/lib/data/changes/admin-save";
import { evidenceOf, OWN_KNOWLEDGE, type EvidenceChoice } from "@/lib/evidence-choice";

/** The most characters a summary may have (the column is VARCHAR(300)). */
export const SUMMARY_MAX = 300;

interface Props {
  segmentId: number;
  /** The label of the segment, for the button's name. */
  label: string;
  /** The version of the segment that this page read. */
  rev: number;
  summary: string | null;
  recent: RecentEvidence[];
}

/** The summary of one segment. The Edit button opens the text in place, with evidence and Save. */
export function SummaryEditor({ segmentId, label, rev, summary, recent }: Props) {
  // The editor stays open until the page reads the new version: a changed `rev` closes it.
  const [openedRev, setOpenedRev] = useState<number | null>(null);
  const editing = openedRev === rev;
  const [draft, setDraft] = useState(summary ?? "");
  const [choice, setChoice] = useState<EvidenceChoice>(OWN_KNOWLEDGE);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useAdminSave(saveAdminChangesAction);
  const headingId = `segment-${segmentId}-summary`;
  const countId = `${headingId}-count`;

  function open() {
    setDraft(summary ?? "");
    setChoice(OWN_KNOWLEDGE);
    setFormError(null);
    form.clear();
    setOpenedRev(rev);
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const picked = evidenceOf(choice);
    if ("error" in picked) return setFormError(picked.error);
    setFormError(null);
    const text = draft.trim();
    form.save({
      edits: [{ op: "update", type: "Segment", id: segmentId, rev, fields: { summary: text === "" ? null : text } }],
      evidence: picked.evidence,
    });
  }

  if (!editing) {
    return (
      <section aria-labelledby={headingId} className="flex flex-col gap-1">
        <h4 id={headingId} className="font-semibold">
          Summary
        </h4>
        {summary ? <p className="whitespace-pre-wrap">{summary}</p> : <p>No summary.</p>}
        <button type="button" onClick={open} aria-label={`Edit summary of ${label}`} className="self-start rounded border border-current px-3 py-1">
          Edit
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} aria-labelledby={headingId} className="flex flex-col gap-3">
      <h4 id={headingId} className="font-semibold">
        Edit summary
      </h4>
      <label className="flex flex-col gap-1">
        Summary
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={SUMMARY_MAX}
          rows={4}
          aria-describedby={countId}
          className="rounded border border-current px-2 py-1"
        />
      </label>
      <p id={countId}>
        {draft.trim().length} of {SUMMARY_MAX} characters
      </p>
      <EvidencePicker value={choice} onChange={setChoice} recent={recent} />
      {formError || form.messages.length > 0 ? (
        <div role="alert" className="flex flex-col gap-2 rounded border border-current p-3">
          {[...(formError ? [formError] : []), ...form.messages].map((message) => (
            <p key={message}>{message}</p>
          ))}
          {form.conflicts.map((conflict) => (
            <div key={conflict.record}>
              <p className="font-semibold">Your version</p>
              <ul>
                {conflict.yours.map((line) => (
                  <li key={line.field}>
                    {line.field}: {line.value}
                  </li>
                ))}
              </ul>
              <p className="font-semibold">Stored version</p>
              <ul>
                {conflict.stored.map((line) => (
                  <li key={line.field}>
                    {line.field}: {line.value}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
      <div className="flex gap-3">
        <button type="submit" disabled={form.pending} className="rounded border border-current px-4 py-2">
          {form.pending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={() => setOpenedRev(null)} disabled={form.pending} className="rounded border border-current px-4 py-2">
          Cancel
        </button>
      </div>
    </form>
  );
}
