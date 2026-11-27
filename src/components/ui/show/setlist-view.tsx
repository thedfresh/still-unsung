import Link from "next/link";
import { MarkdownBody } from "@/components/ui/markdown-body";
import type { Setlist, SetlistRow, SetlistView } from "@/lib/shows/setlist";

const VIEWS: { view: SetlistView; label: string }[] = [
  { view: "standard", label: "Standard" },
  { view: "complete", label: "Complete" },
];

/** The switch between the two views. Plain links: it works with no JavaScript, and both views are real pages. */
export function ViewSwitch({ slug, view }: { slug: string; view: SetlistView }) {
  return (
    <nav aria-label="Setlist view" className="inline-flex rounded-control bg-surface p-0.5 text-small">
      {VIEWS.map((item) => (
        <Link
          key={item.view}
          href={item.view === "standard" ? `/shows/${slug}` : `/shows/${slug}?view=${item.view}`}
          aria-current={item.view === view ? "page" : undefined}
          scroll={false}
          className={`inline-flex min-h-6 items-center rounded-control px-3 py-1 font-medium ${
            item.view === view ? "bg-paper text-ink shadow-card" : "text-body hover:text-ink"
          }`}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

/** What follows a row: a segue mark, or a comma, or nothing after the last row. */
function Separator({ joins, last }: { joins: boolean; last: boolean }) {
  if (last) return null;
  return joins ? (
    <>
      {" "}
      <span aria-hidden="true">&gt;</span>
      <span className="sr-only"> runs into </span>{" "}
    </>
  ) : (
    <>, </>
  );
}

function Row({ row, last }: { row: SetlistRow; last: boolean }) {
  return (
    <li className={row.children.length > 0 ? "block" : "inline"}>
      <span className="font-medium text-ink">{row.title}</span>
      {row.marks.length > 0 && <span className="text-small text-muted"> ({row.marks.join(", ")})</span>}
      {row.footnotes.map((n) => (
        <sup key={n} className="text-label">
          <a id={`fnref-${n}-${row.id}`} href={`#footnote-${n}`} className="px-0.5 text-gold-darker underline">
            <span className="sr-only">Footnote </span>[{n}]
          </a>
        </sup>
      ))}
      {row.children.length > 0 && (
        <ol role="list" className="mt-1 ml-3 border-l-2 border-band-border pl-3 leading-8">
          {row.children.map((child, i) => (
            <Row key={child.id} row={child} last={i === row.children.length - 1} />
          ))}
        </ol>
      )}
      <Separator joins={row.joinsNext} last={last} />
    </li>
  );
}

/** The sets of a show, each with its rows. Plain server HTML. */
export function SetlistView({ setlist }: { setlist: Setlist }) {
  if (setlist.sets.length === 0) return <p className="text-muted italic">No setlist is known.</p>;
  return (
    <div className="flex flex-col gap-4">
      {setlist.sets.map((set) => (
        <section key={set.id} aria-labelledby={`set-${set.id}`}>
          <h3 id={`set-${set.id}`} className="mb-1 font-semibold text-ink">
            {set.label}
            {set.band && <span className="ml-2 text-small font-normal text-muted">({set.band})</span>}
          </h3>
          {set.notes.map((note) => (
            <div key={note.id} className="mb-2 text-small italic text-body">
              <MarkdownBody source={note.body} />
            </div>
          ))}
          {set.rows.length > 0 ? (
            <ol role="list" className="leading-8">
              {set.rows.map((row, i) => (
                <Row key={row.id} row={row} last={i === set.rows.length - 1} />
              ))}
            </ol>
          ) : (
            <p className="text-muted italic">No songs are known for this set.</p>
          )}
        </section>
      ))}
    </div>
  );
}
