import type { Ctx, ProposalName, ProposalRow } from "./context.ts";
import { chunk } from "./rules.ts";

// Readable context for the review lists (HSA-151). A row keeps its ids and legacy ids; this adds
// a `label` and a `context` object so the curator can decide a row without four lookups. The
// lines read the new database after the import. The files stay outside the repository.

export type ContextValue = string | number | boolean | null;
export interface ReviewRow {
  label: string;
  context: Record<string, ContextValue>;
  [key: string]: unknown;
}

interface DateParts {
  dateYear: number | null;
  dateMonth: number | null;
  dateDay: number | null;
  dateAsWritten: string | null;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A partial date as stored: year only, year and month, or a full date. Nothing is filled in. */
export function formatPartialDate(show: DateParts): string {
  if (show.dateYear === null) return show.dateAsWritten ?? "date unknown";
  if (show.dateMonth === null) return String(show.dateYear);
  if (show.dateDay === null) return `${show.dateYear}-${pad(show.dateMonth)}`;
  return `${show.dateYear}-${pad(show.dateMonth)}-${pad(show.dateDay)}`;
}

interface ShowInfo {
  date: string;
  place: string;
  band: string;
  showType: string;
}

interface SetInfo extends ShowInfo {
  setPosition: number;
  setType: string;
}

const ids = (value: unknown): number[] =>
  typeof value === "number"
    ? [value]
    : typeof value === "string"
      ? value.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0)
      : [];

/** The lookups for one run: each loads its records once, in batches. */
class Lookup {
  private readonly ctx: Ctx;
  readonly shows = new Map<number, ShowInfo>();
  readonly sets = new Map<number, SetInfo>();
  readonly segments = new Map<number, { setId: number; order: number; workId: number | null; delivery: string | null }>();
  readonly works = new Map<number, string>();
  readonly people = new Map<number, string>();
  readonly places = new Map<number, string>();

  constructor(ctx: Ctx) {
    this.ctx = ctx;
  }

  async loadShows(showIds: number[]): Promise<void> {
    for (const part of chunk([...new Set(showIds)].filter((id) => !this.shows.has(id)), 5000)) {
      const rows = await this.ctx.db.show.findMany({
        where: { id: { in: part } },
        select: {
          id: true,
          dateYear: true,
          dateMonth: true,
          dateDay: true,
          dateAsWritten: true,
          band: { select: { name: true } },
          showType: { select: { name: true } },
          placeName: { select: { name: true } },
          place: { select: { names: { select: { name: true }, orderBy: { position: "desc" }, take: 1 } } },
        },
      });
      for (const row of rows) {
        this.shows.set(row.id, {
          date: formatPartialDate(row),
          place: row.placeName?.name ?? row.place?.names[0]?.name ?? "place unknown",
          band: row.band?.name ?? "no band",
          showType: row.showType?.name ?? "no show type",
        });
      }
    }
  }

  async loadSets(setIds: number[]): Promise<void> {
    const wanted = [...new Set(setIds)].filter((id) => !this.sets.has(id));
    const rows = [] as Array<{ id: number; showId: number; position: number; setType: { name: string } }>;
    for (const part of chunk(wanted, 5000)) {
      rows.push(...(await this.ctx.db.set.findMany({
        where: { id: { in: part } },
        select: { id: true, showId: true, position: true, setType: { select: { name: true } } },
      })));
    }
    await this.loadShows(rows.map((row) => row.showId));
    for (const row of rows) {
      const show = this.shows.get(row.showId);
      if (show) this.sets.set(row.id, { ...show, setPosition: row.position, setType: row.setType.name });
    }
  }

  async loadSegments(segmentIds: number[]): Promise<void> {
    const wanted = [...new Set(segmentIds)].filter((id) => !this.segments.has(id));
    const rows = [] as Array<{ id: number; setId: number; workId: number | null; delivery: string | null }>;
    for (const part of chunk(wanted, 5000)) {
      rows.push(...(await this.ctx.db.segment.findMany({
        where: { id: { in: part } },
        select: { id: true, setId: true, workId: true, delivery: true },
      })));
    }
    await this.loadSets(rows.map((row) => row.setId));
    // The place of a segment is its rank among the segments of its set, by sort key.
    const orderOf = new Map<number, number>();
    for (const part of chunk([...new Set(rows.map((row) => row.setId))], 2000)) {
      const siblings = await this.ctx.db.segment.findMany({
        where: { setId: { in: part } },
        select: { id: true, setId: true, sortKey: true },
      });
      const bySet = new Map<number, typeof siblings>();
      for (const sibling of siblings) bySet.set(sibling.setId, [...(bySet.get(sibling.setId) ?? []), sibling]);
      for (const group of bySet.values()) {
        group.sort((a, b) => (a.sortKey < b.sortKey ? -1 : a.sortKey > b.sortKey ? 1 : 0));
        group.forEach((sibling, index) => orderOf.set(sibling.id, index + 1));
      }
    }
    await this.loadWorks(rows.flatMap((row) => (row.workId === null ? [] : [row.workId])));
    for (const row of rows) this.segments.set(row.id, { ...row, order: orderOf.get(row.id) ?? 0 });
  }

  async loadWorks(workIds: number[]): Promise<void> {
    for (const part of chunk([...new Set(workIds)].filter((id) => !this.works.has(id)), 5000)) {
      for (const row of await this.ctx.db.work.findMany({ where: { id: { in: part } }, select: { id: true, title: true } })) {
        this.works.set(row.id, row.title);
      }
    }
  }

  async loadPeople(personIds: number[]): Promise<void> {
    for (const part of chunk([...new Set(personIds)].filter((id) => !this.people.has(id)), 5000)) {
      for (const row of await this.ctx.db.person.findMany({ where: { id: { in: part } }, select: { id: true, name: true } })) {
        this.people.set(row.id, row.name);
      }
    }
  }

  async loadPlaces(placeIds: number[]): Promise<void> {
    for (const part of chunk([...new Set(placeIds)].filter((id) => !this.places.has(id)), 5000)) {
      const rows = await this.ctx.db.place.findMany({
        where: { id: { in: part } },
        select: { id: true, names: { select: { name: true }, orderBy: { position: "desc" }, take: 1 } },
      });
      for (const row of rows) this.places.set(row.id, row.names[0]?.name ?? `place ${row.id}`);
    }
  }
}

/** The old text a row is about, cut to a length a person reads at a glance. */
const excerpt = (text: unknown, max = 300): string | null => {
  if (typeof text !== "string" || text === "") return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
};

/** Public and private notes of a record, for a row whose list has no text of its own. */
function notesOf(ctx: Ctx, entityId: number): string | null {
  const bodies = ctx.notes.filter((note) => note.entityId === entityId).map((note) => note.body);
  return bodies.length > 0 ? excerpt(bodies.join(" / ")) : null;
}

const join = (parts: Array<string | number | null | undefined>) => parts.filter((p) => p !== null && p !== undefined && p !== "").join(" · ");

/** Add `label` and `context` to every row of every list. Ids and legacy ids stay as they are. */
export async function addContext(ctx: Ctx, lists: Map<ProposalName, ProposalRow[]>): Promise<Map<ProposalName, ReviewRow[]>> {
  const all = [...lists.values()].flat();
  const lookup = new Lookup(ctx);
  await lookup.loadSegments(all.flatMap((row) => ids(row.segmentId)));
  await lookup.loadSets(all.flatMap((row) => ids(row.setId)));
  await lookup.loadShows(all.flatMap((row) => ids(row.showId)));
  await lookup.loadWorks(all.flatMap((row) => [...ids(row.workId), ...ids(row.parentWorkId)]));
  await lookup.loadPeople(all.flatMap((row) => ids(row.personIds)));
  await lookup.loadPlaces(all.flatMap((row) => ids(row.placeIds)));

  const out = new Map<ProposalName, ReviewRow[]>();
  for (const [name, rows] of lists) {
    out.set(name, rows.map((row) => describeRow(ctx, lookup, row)));
  }
  return out;
}

function describeRow(ctx: Ctx, lookup: Lookup, row: ProposalRow): ReviewRow {
  const context: Record<string, ContextValue> = {};
  const parts: Array<string | number | null | undefined> = [];

  const segment = typeof row.segmentId === "number" ? lookup.segments.get(row.segmentId) : undefined;
  const setInfo = segment ? lookup.sets.get(segment.setId) : typeof row.setId === "number" ? lookup.sets.get(row.setId) : undefined;
  const showInfo = setInfo ?? (typeof row.showId === "number" ? lookup.shows.get(row.showId) : undefined);
  if (showInfo) {
    context.showDate = showInfo.date;
    context.place = showInfo.place;
    context.band = showInfo.band;
    parts.push(showInfo.date, showInfo.place);
    if (!setInfo) parts.push(showInfo.band);
  }
  if (setInfo) {
    context.setPosition = setInfo.setPosition;
    context.setType = setInfo.setType;
    parts.push(`set ${setInfo.setPosition}`);
  }
  if (segment) {
    context.segmentPosition = segment.order;
    const title = segment.workId === null ? null : (lookup.works.get(segment.workId) ?? null);
    context.songTitle = title;
    parts.push(title ?? (segment.delivery === "SPOKEN" ? "spoken segment" : "segment without a work"), `segment ${segment.order}`);
  }
  const workIds = ids(row.workId);
  if (!segment && workIds.length > 0) {
    context.workTitle = lookup.works.get(workIds[0]) ?? null;
    parts.push(context.workTitle);
  }
  if (typeof row.parentWorkId === "number") context.parentWorkTitle = lookup.works.get(row.parentWorkId) ?? null;
  const personIds = ids(row.personIds);
  if (personIds.length > 0) {
    context.people = personIds.map((id) => lookup.people.get(id) ?? `person ${id}`).join(" | ");
    parts.push(context.people);
  }
  const placeIds = ids(row.placeIds);
  if (placeIds.length > 0) {
    context.places = placeIds.map((id) => lookup.places.get(id) ?? `place ${id}`).join(" | ");
    parts.push(context.places);
  }

  // The text the row is about: its own, or the notes on the record.
  const entityId = typeof row.segmentId === "number" ? row.segmentId : typeof row.showId === "number" ? row.showId : null;
  const text = excerpt(row.text) ?? (row.proposal && entityId !== null && !("text" in row) ? notesOf(ctx, entityId) : null);
  if (text !== null) context.text = text;
  if (typeof row.matchedText === "string" && row.matchedText !== "") parts.push(`"${row.matchedText}"`);
  else if (text !== null) parts.push(`"${text.slice(0, 80)}${text.length > 80 ? "…" : ""}"`);

  // A row of a list with a fallback label: its legacy id is always a label.
  const label = join(parts) || String(row.legacyId ?? row.title ?? row.name ?? "unlabelled row");
  if (typeof row.name === "string") context.name = row.name;
  if (typeof row.title === "string") context.title = row.title;
  if (typeof row.suite === "string") context.suite = row.suite;
  return { label, context, ...row };
}
