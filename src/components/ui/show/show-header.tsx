import Link from "next/link";
import type { PublicShow, PublicShowLink } from "@/lib/data/public/show-types";
import { placeText, publicDate } from "@/lib/shows/public-words";

const NAV_LINK = "inline-flex min-h-6 items-center rounded-control border border-band-border px-3 py-1 text-small font-medium text-band-ink hover:bg-paper";

/** Previous and next show in date order. A missing neighbour is plain text, not a dead link. */
function Neighbours({ prev, next }: { prev: PublicShowLink | null; next: PublicShowLink | null }) {
  return (
    <nav aria-label="Neighbouring shows" className="flex gap-2">
      {prev ? (
        <Link href={`/shows/${prev.slug}`} rel="prev" className={NAV_LINK}>
          Previous show
        </Link>
      ) : (
        <span className="px-3 py-1 text-small text-body">No earlier show</span>
      )}
      {next ? (
        <Link href={`/shows/${next.slug}`} rel="next" className={NAV_LINK}>
          Next show
        </Link>
      ) : (
        <span className="px-3 py-1 text-small text-body">No later show</span>
      )}
    </nav>
  );
}

/**
 * The header of the show page: the band, the date, the place by the name the show used, what the
 * show was billed as and the bill. It sits on the band's theme (the page sets the theme class).
 */
export function ShowHeader({ show, prev, next }: { show: PublicShow; prev: PublicShowLink | null; next: PublicShowLink | null }) {
  const date = publicDate(show.date);
  const place = placeText(show.placeName, show.placeCertainty);
  return (
    <header className="flex flex-col gap-2 border-b border-band-border bg-band-bg px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-band-ink">{show.band?.name ?? "Robert Hunter"}</p>
        <Neighbours prev={prev} next={next} />
      </div>
      <h1 className="flex flex-col text-section font-semibold text-ink sm:flex-row sm:flex-wrap sm:items-baseline sm:gap-x-3">
        {date.iso ? <time dateTime={date.iso}>{date.text}</time> : <span>{date.text}</span>}
        {show.timeLabel && <span className="text-lead font-normal text-body">{show.timeLabel} show</span>}
        {place && <span className="text-lead font-normal text-body">{place}</span>}
      </h1>
      {date.iso && <p className="text-small text-body">Date: {date.iso}</p>}
      {show.billedAs && <p className="text-small italic text-body">Billed as: {show.billedAs}</p>}
      {show.statusWords && <p className="text-small font-medium text-ink">Status: {show.statusWords}</p>}
      {show.bill.length > 0 && (
        <section aria-label="Bill">
          <h2 className="sr-only">Bill</h2>
          <ul role="list" className="text-small text-body">
            {show.bill.map((entry) => (
              <li key={entry.id}>
                {entry.name} ({entry.role}
                {entry.certainty === "CONFIRMED" ? "" : `, ${entry.certainty.toLowerCase()}`})
              </li>
            ))}
          </ul>
        </section>
      )}
    </header>
  );
}
