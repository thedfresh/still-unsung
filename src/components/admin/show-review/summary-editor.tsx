"use client";

import { useState } from "react";
import { saveAdminChangesAction } from "@/app/admin/save-action";
import { EvidencePicker } from "@/components/admin/evidence-picker";
import { Button, Message } from "@/components/admin/ui/components";
import { FIELD_CLASS, HINT_CLASS, INPUT_CLASS, LABEL_CLASS } from "@/components/admin/ui/styles";
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
        <Button onClick={open} aria-label={`Edit summary of ${label}`} className="self-start">
          Edit
        </Button>
      </section>
    );
  }

  return (
    <form onSubmit={submit} aria-labelledby={headingId} className="flex flex-col gap-3">
      <h4 id={headingId} className="font-semibold">
        Edit summary
      </h4>
      <label className={FIELD_CLASS}>
        <span className={LABEL_CLASS}>Summary</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={SUMMARY_MAX}
          rows={4}
          aria-describedby={countId}
          className={INPUT_CLASS}
        />
      </label>
      <p id={countId} className={HINT_CLASS}>
        {draft.trim().length} of {SUMMARY_MAX} characters
      </p>
      <EvidencePicker value={choice} onChange={setChoice} recent={recent} />
      {formError || form.messages.length > 0 ? (
        <Message tone="error">
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
        </Message>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="save" busy={form.pending}>
          {form.pending ? "Saving…" : "Save"}
        </Button>
        <Button onClick={() => setOpenedRev(null)} disabled={form.pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
