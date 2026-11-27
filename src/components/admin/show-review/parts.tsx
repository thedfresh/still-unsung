import Link from "next/link";
import type { ReactNode } from "react";
import { LINK_CLASS, ROW_CLASS } from "@/components/admin/ui/styles";
import type { ReviewAttachments, ReviewLine } from "@/lib/data/shows/review-types";

/** The card style of the Changes page. Long text wraps. */
export const CARD = ROW_CLASS;

/** One short line that says where a record came from. */
export function Origin({ text }: { text: string | null }) {
  return text ? <p className="text-sm">{text}</p> : null;
}

/** Label and value pairs. A pair with no value is left out. */
export function Facts({ items }: { items: Array<[string, ReactNode | null | undefined]> }) {
  const shown = items.filter(([, value]) => value !== null && value !== undefined && value !== "");
  if (shown.length === 0) return null;
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-1">
      {shown.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-semibold">{label}</dt>
          <dd className="min-w-0 break-words">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A name as a link to its record page (HSA-186), or plain text with no page. Null with no name. */
export function linked(text: string | null, href: string | null): ReactNode | null {
  if (!text) return null;
  return href ? (
    <Link href={href} className={LINK_CLASS}>
      {text}
    </Link>
  ) : (
    text
  );
}

/** A line of text with the name of a record as a link (HSA-186). With no link the text shows plain. */
function LinkedLine({ line }: { line: ReviewLine }) {
  const { link, text } = line;
  const at = link ? text.indexOf(link.text) : -1;
  if (!link || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Link href={link.href} className={LINK_CLASS}>
        {link.text}
      </Link>
      {text.slice(at + link.text.length)}
    </>
  );
}

/** A titled list of lines, each with its origin. Nothing shows when the list is empty. */
export function Lines({ title, lines, level = 3 }: { title: string; lines: ReviewLine[]; level?: 2 | 3 | 4 }) {
  if (lines.length === 0) return null;
  const Heading = `h${level}` as "h2" | "h3" | "h4";
  return (
    <section className="flex flex-col gap-1">
      <Heading className="font-semibold">{title}</Heading>
      <ul className="ml-4 flex list-disc flex-col gap-1">
        {lines.map((line) => (
          <li key={line.key} className="min-w-0 break-words">
            <LinkedLine line={line} />
            <Origin text={line.origin} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The references, citations and notes under a record. `level` is the heading level of their titles. */
export function Attachments({ data, level = 4 }: { data: ReviewAttachments; level?: 3 | 4 }) {
  const Heading = `h${level}` as "h3" | "h4";
  return (
    <>
      {data.references.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Heading className="font-semibold">References</Heading>
          <ul className="ml-4 flex list-disc flex-col gap-1">
            {data.references.map((ref) => (
              <li key={ref.key} className="min-w-0 break-words">
                {ref.kind}:{" "}
                {ref.href ? (
                  <Link href={ref.href} className={LINK_CLASS}>
                    {ref.target}
                  </Link>
                ) : (
                  ref.target
                )}
                {ref.certainty ? ` (${ref.certainty})` : ""}
                {ref.note ? `. Note: ${ref.note}` : ""}
                <Origin text={ref.origin} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.citations.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Heading className="font-semibold">Citations</Heading>
          <ul className="ml-4 flex list-disc flex-col gap-1">
            {data.citations.map((cite) => (
              <li key={cite.key} className="min-w-0 break-words">
                {[cite.by, cite.aspect, cite.place].filter(Boolean).join("; ")}
                {cite.note ? `. Note: ${cite.note}` : ""}
                {cite.excerpt ? <p className="whitespace-pre-wrap">Excerpt (private): {cite.excerpt}</p> : null}
                <Origin text={cite.origin} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {data.notes.length > 0 ? (
        <section className="flex flex-col gap-1">
          <Heading className="font-semibold">Notes</Heading>
          <ul className="ml-4 flex list-disc flex-col gap-1">
            {data.notes.map((note) => (
              <li key={note.key} className="min-w-0 break-words">
                {note.isPublic ? "" : "(private) "}
                <span className="whitespace-pre-wrap">{note.body}</span>
                <Origin text={note.origin} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
