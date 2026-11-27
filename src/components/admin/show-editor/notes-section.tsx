"use client";

import { useState } from "react";
import { addNoteEdits, removeNoteEdit, updateNoteEdit } from "@/lib/shows/edit-edits";
import type { EditNote, ShowEditData } from "@/lib/shows/edit-types";
import { BUTTON, INPUT, SECTION_CARD, useEditor } from "./editor-context";

function Visibility({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex flex-col gap-1">
      {label}
      <select value={value ? "public" : "private"} onChange={(e) => onChange(e.target.value === "public")} className={INPUT}>
        <option value="private">Private: only admins see it</option>
        <option value="public">Public: readers see it</option>
      </select>
    </label>
  );
}

function NoteRow({ note, index }: { note: EditNote; index: number }) {
  const { send, pending } = useEditor();
  const [body, setBody] = useState(note.body);
  const [isPublic, setIsPublic] = useState(note.isPublic);
  const name = `note ${index + 1}`;
  return (
    <li className={`${SECTION_CARD} flex flex-col gap-2`}>
      {note.alsoAttachedTo > 0 ? (
        <p>
          This note is also attached to {note.alsoAttachedTo} other {note.alsoAttachedTo === 1 ? "record" : "records"}. An edit changes it there too.
        </p>
      ) : null}
      <label className="flex flex-col gap-1">
        Text of {name}
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={INPUT} />
      </label>
      <Visibility label={`Who sees ${name}`} value={isPublic} onChange={setIsPublic} />
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={pending} className={BUTTON} onClick={() => send(updateNoteEdit(note, body, isPublic))}>
          Save {name}
        </button>
        <button type="button" disabled={pending} className={BUTTON} onClick={() => send(removeNoteEdit(note))}>
          Remove {name} from this show
        </button>
      </div>
    </li>
  );
}

/** The show's notes, public and private. A new note and its link to the show save together. */
export function NotesSection({ show }: { show: ShowEditData }) {
  const { send, pending } = useEditor();
  const [body, setBody] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  return (
    <section aria-labelledby="notes" className="flex flex-col gap-3">
      <h2 id="notes" className="text-xl font-semibold">
        Notes
      </h2>
      {show.notes.length === 0 ? (
        <p>No notes on this show.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {show.notes.map((note, index) => (
            <NoteRow key={`${note.noteId}-${note.noteRev}`} note={note} index={index} />
          ))}
        </ul>
      )}
      <form
        aria-labelledby="add-note"
        className={`${SECTION_CARD} flex flex-col gap-3`}
        onSubmit={(event) => {
          event.preventDefault();
          send(addNoteEdits(show.id, body, isPublic), () => setBody(""));
        }}
      >
        <h3 id="add-note" className="font-semibold">
          Add a note
        </h3>
        <label className="flex flex-col gap-1">
          Text of the new note
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={INPUT} />
        </label>
        <Visibility label="Who sees the new note" value={isPublic} onChange={setIsPublic} />
        <button type="submit" disabled={pending} className={`${BUTTON} self-start`}>
          {pending ? "Saving…" : "Add the note"}
        </button>
      </form>
    </section>
  );
}
