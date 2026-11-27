import Link from "next/link";
import type { Readout, ReadoutCard, ReadoutField } from "@/lib/changes/readout";

/** A hairline border, a large radius and a small shadow: the card style of the design system. */
export const CARD = "rounded-lg border border-black/15 p-3 shadow-sm";

function Field({ field }: { field: ReadoutField }) {
  if (field.was === undefined) {
    return (
      <li>
        <strong>{field.name}</strong>: {field.value}
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

function Card({ card }: { card: ReadoutCard }) {
  return (
    <li className={CARD}>
      <p className="font-medium">{card.action ? `${card.action} · ${card.title}` : card.title}</p>
      {card.fields.length > 0 && (
        <ul className="mt-1 flex list-none flex-col gap-1 pl-3">
          {card.fields.map((field, index) => (
            <Field key={`${field.name}-${index}`} field={field} />
          ))}
        </ul>
      )}
      {card.showId !== undefined && (
        <p className="mt-1">
          <Link href={`/admin/shows/${card.showId}`} className="underline">
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
          <h3 className="font-semibold">{group.heading}</h3>
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
