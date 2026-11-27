import { MarkdownBody } from "@/components/ui/markdown-body";
import type { PublicNote, PublicRecording } from "@/lib/data/public/show-types";
import type { Footnote, StageTalkEntry } from "@/lib/shows/setlist";

const HEADING = "mb-2 text-lead font-semibold text-band-ink";

export function StageTalk({ entries }: { entries: StageTalkEntry[] }) {
  if (entries.length === 0) return null;
  return (
    <section aria-labelledby="stage-talk">
      <h2 id="stage-talk" className={HEADING}>
        Stage talk
      </h2>
      <ol role="list" className="flex flex-col gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            {entry.summary} <span className="text-small text-muted">({entry.setLabel})</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ShowNotes({ notes }: { notes: PublicNote[] }) {
  if (notes.length === 0) return null;
  return (
    <section aria-labelledby="show-notes">
      <h2 id="show-notes" className={HEADING}>
        Show notes
      </h2>
      <div className="flex flex-col gap-3">
        {notes.map((note) => (
          <MarkdownBody key={note.id} source={note.body} />
        ))}
      </div>
    </section>
  );
}

/** The numbered footnotes of the complete view. */
export function Footnotes({ footnotes }: { footnotes: Footnote[] }) {
  if (footnotes.length === 0) return null;
  return (
    <section aria-labelledby="footnotes">
      <h2 id="footnotes" className={HEADING}>
        Footnotes
      </h2>
      <ol role="list" className="flex flex-col gap-2">
        {footnotes.map((note) => (
          <li key={note.number} id={`footnote-${note.number}`} className="flex gap-2">
            <span className="font-semibold">[{note.number}]</span>
            <div>{note.markdown ? <MarkdownBody source={note.text} /> : note.text}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function RecordingLine({ recording }: { recording: PublicRecording }) {
  const facts = [
    recording.type,
    recording.description,
    recording.taper ? `recorded by ${recording.taper}` : null,
    recording.lengthMinutes !== null ? `${recording.lengthMinutes} minutes` : null,
    recording.inCirculation ? null : "not in circulation",
  ].filter(Boolean);
  return (
    <li>
      {facts.length > 0 ? facts.join("; ") : "Recording"}
      {recording.links.map((link) => (
        <span key={link.url}>
          {" "}
          <a href={link.url} rel="noopener noreferrer" className="text-gold-darker underline">
            {link.label}
            <span className="sr-only"> (opens the page of the recording)</span>
          </a>
        </span>
      ))}
    </li>
  );
}

/** A plain list of recordings, with links. The full recording card is a later ticket. */
export function Recordings({ recordings }: { recordings: PublicRecording[] }) {
  if (recordings.length === 0) return null;
  return (
    <section aria-labelledby="recordings">
      <h2 id="recordings" className={HEADING}>
        Recordings
      </h2>
      <ul role="list" className="flex flex-col gap-2">
        {recordings.map((recording) => (
          <RecordingLine key={recording.id} recording={recording} />
        ))}
      </ul>
    </section>
  );
}
