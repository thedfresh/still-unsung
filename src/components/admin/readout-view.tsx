import Link from "next/link";
import type { ReactNode } from "react";
import { LINK_CLASS, ROW_CLASS } from "@/components/admin/ui/styles";
import type { Readout, ReadoutCard, ReadoutField } from "@/lib/changes/readout";
import type { ReadoutLink } from "@/lib/changes/readout-links";

/** A hairline border, a large radius and a small shadow: the card style of the design system. */
export const CARD = ROW_CLASS;

/** A value with each record name as a link, in order of appearance (HSA-186). Text with no match stays plain. */
function LinkedValue({ text, links }: { text: string; links?: ReadoutLink[] }): ReactNode {
  if (!links || links.length === 0) return text;
  const parts: ReactNode[] = [];
  let rest = text;
  links.forEach((link, index) => {
    const at = rest.indexOf(link.text);
    if (at < 0) return;
    if (at > 0) parts.push(rest.slice(0, at));
    parts.push(
      <Link key={index} href={link.href} className={LINK_CLASS}>
        {link.text}
      </Link>,
    );
    rest = rest.slice(at + link.text.length);
  });
  return (
    <>
      {parts}
      {rest}
    </>
  );
}

function Field({ field }: { field: ReadoutField }) {
  if (field.was === undefined) {
    return (
      <li>
        <strong>{field.name}</strong>: <LinkedValue text={field.value ?? ""} links={field.links} />
      </li>
    );
  }
  return (
    <li>
      <strong>{field.name}</strong>
      <div className="ml-4">was: {field.was}</div>
      <div className="ml-4">now: {field.now}</div>
    </li>
  );
}

/** The title of a card: the record's name links to its page when the record has one. */
function CardTitle({ card }: { card: ReadoutCard }) {
  const text = card.action ? `${card.action} · ${card.title}` : card.title;
  return (
    <p className="font-medium">
      {card.href ? (
        <Link href={card.href} className={LINK_CLASS}>
          {text}
        </Link>
      ) : (
        text
      )}
    </p>
  );
}

function Card({ card }: { card: ReadoutCard }) {
  return (
    <li className={CARD}>
      <CardTitle card={card} />
      {card.fields.length > 0 && (
        <ul className="mt-1 flex list-none flex-col gap-1 pl-3">
          {card.fields.map((field, index) => (
            <Field key={`${field.name}-${index}`} field={field} />
          ))}
        </ul>
      )}
      {card.showId !== undefined && (
        <p className="mt-1">
          <Link href={`/admin/shows/${card.showId}`} className={LINK_CLASS}>
            Open the show as it is now
          </Link>
        </p>
      )}
    </li>
  );
}

/** A set of changes as cards: the counts, "Look at these first", then the records under their parent. */
export function ReadoutView({ readout }: { readout: Readout }) {
  return (
    <div className="mt-3 flex flex-col gap-4">
      <p>{readout.counts}</p>
      {readout.unusual.length > 0 && (
        <section>
          <h3 className="font-semibold">Look at these first</h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {readout.unusual.map((card, index) => (
              <Card key={index} card={card} />
            ))}
          </ul>
          {readout.unusualMore > 0 && <p>...and {readout.unusualMore} more. They are in the list below.</p>}
        </section>
      )}
      {readout.groups.map((group, index) => (
        <section key={index}>
          <h3 className="font-semibold">
            {group.href ? (
              <Link href={group.href} className={LINK_CLASS}>
                {group.heading}
              </Link>
            ) : (
              group.heading
            )}
          </h3>
          <ul className="mt-2 flex list-none flex-col gap-2 p-0">
            {group.cards.map((card, cardIndex) => (
              <Card key={cardIndex} card={card} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
