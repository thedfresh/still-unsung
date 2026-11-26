import pg, { type Pool } from "pg";
import type { EntityKind } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { chunk, type NoteHint, type Row } from "./rules.ts";

// Shared state of one import run: the old database (read only), the new database, the id maps
// from old rows to new records, and the collectors that feed the report and the proposals.

export interface Settings {
  /** Zotero keys of the three sources that must exist first (plan section 2). */
  zotero: { legacySetlistList: string; gdsets: string; whitegum: string };
  /** Sign-in emails of the two accounts (item 89). From the environment, never from the repo. */
  curatorEmail: string | null;
  agentEmail: string | null;
}

// The old schema stores timestamps without a zone, in UTC. Read them as UTC, whatever the zone
// of this machine, so dates keep their day and `created_at` keeps its hour.
const UTC_TYPES = {
  getTypeParser: (oid: number, format?: "text" | "binary") =>
    oid === 1114 ? (value: string) => new Date(`${value.replace(" ", "T")}Z`) : pg.types.getTypeParser(oid, format as "text"),
};

export class Legacy {
  private readonly present: Set<string>;
  private readonly cache = new Map<string, Row[]>();
  private readonly pool: Pool;
  private readonly schema: string;

  // No parameter properties: Node runs these scripts by stripping types only.
  constructor(pool: Pool, schema: string, tables: string[]) {
    this.pool = pool;
    this.schema = schema;
    this.present = new Set(tables);
  }

  static async open(pool: Pool, schema: string): Promise<Legacy> {
    const found = await pool.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'",
      [schema],
    );
    return new Legacy(pool, schema, found.rows.map((row) => row.table_name));
  }

  has(table: string): boolean {
    return this.present.has(table);
  }

  tables(): string[] {
    return [...this.present].sort();
  }

  /** Every row of an old table, in id order. An absent table gives no rows. */
  async rows(table: string): Promise<Row[]> {
    if (!this.present.has(table)) return [];
    const cached = this.cache.get(table);
    if (cached) return cached;
    if (!/^[a-z_]+$/.test(table) || !/^[a-z_]+$/.test(this.schema)) throw new Error("Bad table name");
    const result = await this.pool.query<Row>({
      text: `SELECT * FROM "${this.schema}"."${table}" ORDER BY 1`,
      types: UTC_TYPES,
    });
    this.cache.set(table, result.rows);
    return result.rows;
  }
}

/** The ledger behind "nothing lost" (plan section 6, test 7). */
export class Tally {
  private readonly seen = new Map<string, Set<number>>();
  private readonly mappedIds = new Map<string, Set<number>>();
  readonly dropped = new Map<string, Map<string, number[]>>();
  readonly unmapped = new Map<string, Map<string, number[]>>();

  /** Register the old rows of a table. Call it once per table, right after reading it. */
  register(table: string, rows: Row[]): void {
    this.seen.set(table, new Set(rows.map((row) => Number(row.id))));
  }

  mapped(table: string, id: unknown): void {
    this.add(this.mappedIds, table, Number(id));
  }

  drop(table: string, id: unknown, rule: string): void {
    this.push(this.dropped, table, rule, Number(id));
  }

  notMapped(table: string, id: unknown, reason: string): void {
    this.push(this.unmapped, table, reason, Number(id));
  }

  private add(map: Map<string, Set<number>>, table: string, id: number): void {
    const set = map.get(table) ?? new Set<number>();
    set.add(id);
    map.set(table, set);
  }

  private push(map: Map<string, Map<string, number[]>>, table: string, key: string, id: number): void {
    const inner = map.get(table) ?? new Map<string, number[]>();
    inner.set(key, [...(inner.get(key) ?? []), id]);
    map.set(table, inner);
  }

  tablesSeen(): string[] {
    return [...this.seen.keys()].sort();
  }

  summary(table: string): {
    total: number;
    mapped: number;
    dropped: number;
    unmapped: number;
    unaccounted: number[];
  } {
    const all = this.seen.get(table) ?? new Set<number>();
    const mapped = this.mappedIds.get(table) ?? new Set<number>();
    const dropped = new Set([...(this.dropped.get(table)?.values() ?? [])].flat());
    const unmapped = new Set([...(this.unmapped.get(table)?.values() ?? [])].flat());
    const unaccounted = [...all].filter((id) => !mapped.has(id) && !dropped.has(id) && !unmapped.has(id));
    return {
      total: all.size,
      mapped: [...all].filter((id) => mapped.has(id)).length,
      dropped: [...all].filter((id) => !mapped.has(id) && dropped.has(id)).length,
      unmapped: [...all].filter((id) => !mapped.has(id) && !dropped.has(id) && unmapped.has(id)).length,
      unaccounted,
    };
  }
}

export interface PendingNote {
  entityId: number;
  body: string;
  isPublic: boolean;
  legacyId: string;
}

export interface PendingExternalId {
  entityId: number;
  system: string;
  value: string;
  legacyId: string;
  isActive?: boolean;
  checkedAt?: Date | null;
}

export interface ProposalRow {
  /** Plain values: new ids, old ids, flags. Quoted old text only where the list needs it. */
  [key: string]: string | number | boolean | null | undefined;
}

export const PROPOSAL_NAMES = [
  "01-bill",
  "02-uncertain-songs",
  "03-banter-summaries",
  "04-typed-footnotes",
  "05-variant-songs",
  "06-person-merges",
  "07-place-merges",
  "08-credit-splits",
  "09-suite-parts",
  "10-incomplete-setlists",
  "11-instrumental-works",
  "12-best-known-versions",
  "13-a-cappella",
  "14-guests-in-notes",
  "15-old-uncertain-flags",
  "16-musical-fragments",
  "17-interview-show-types",
  "18-quotes-and-teases",
  "19-reported-not-on-tape",
  "20-hunter-does-not-play",
  "21-from-an-album",
] as const;
export type ProposalName = (typeof PROPOSAL_NAMES)[number];

/** The review list that each note hint feeds (section 5 of the plan; items 64, 97, 121). */
export const HINT_LISTS: Record<NoteHint, ProposalName> = {
  bill: "01-bill",
  guest: "14-guests-in-notes",
  "a-cappella": "13-a-cappella",
  "quote-or-tease": "18-quotes-and-teases",
  reported: "19-reported-not-on-tape",
  "hunter-absent": "20-hunter-does-not-play",
  "from-album": "21-from-an-album",
};

/** Report lines that hold ids and counts only (never banter text, emails or raw entries). */
export interface ReportLine {
  section: string;
  text: string;
}

export class Ctx {
  readonly notes: PendingNote[] = [];
  /** Old web addresses (item 45): one per old slug. */
  readonly addresses: Array<{ path: string; entityId: number; slug: string | null }> = [];
  readonly proposals = new Map<ProposalName, ProposalRow[]>(PROPOSAL_NAMES.map((name) => [name, []]));
  readonly lines: ReportLine[] = [];
  readonly fieldDrops = new Map<string, number>();
  readonly externalIds: PendingExternalId[] = [];
  /** Old link ids that are recording candidates (item 118): no external ID is made from them. */
  readonly recordingLinkIds = new Set<number>();
  /** Old song slug to the work title: the internal links in notes become wikilinks (item 23). */
  readonly songTitleBySlug = new Map<string, string>();
  /** Old songs "Unknown Song" and "Unknown Instrumental": no work (item 121). Old id to the title. */
  readonly unknownSongs = new Map<number, string>();
  /** The old content type name of each kept event (item 16: Poetry Reading). */
  readonly eventContentType = new Map<number, string>();
  /** The archive of the old site, by old event id (items 119, 120). Written with the show. */
  readonly legacyShowData = new Map<number, Record<string, unknown>>();
  /** By old event id: whether the show is public, its band, and its row. */
  readonly eventPublic = new Map<number, boolean>();
  readonly eventBand = new Map<number, number | null>();
  readonly eventRow = new Map<number, Row>();
  readonly tally = new Tally();
  /** Old creation dates to carry over (plan section 4, intro): written by `applyCreatedDates`. */
  readonly createdDates: Array<{ kind: EntityKind; id: number; at: Date }> = [];

  // Old id to new id, one map per kind of old row.
  readonly personByMusician = new Map<number, number | null>();
  readonly personByName = new Map<string, number>();
  readonly lineupByBandMusician = new Map<number, number>();
  readonly bandByBand = new Map<number, number>();
  /** The place of a venue, and the name it used. An unknown venue is its town, with no name. */
  readonly placeByVenue = new Map<number, { placeId: number; nameId: number | null }>();
  /** Venues whose old context names a festival: old venue id to the festival name (plan, Venue). */
  /** Interview shows (item 96), handled after the segments exist. */
  readonly interviewShows: Array<{ oldId: number; displayDate: string | null; showTypeId: number | null }> = [];
  readonly festivalByVenue = new Map<number, string>();
  readonly workBySong = new Map<number, number>();
  readonly showByEvent = new Map<number, number>();
  readonly setBySet = new Map<number, number>();
  readonly segmentByPerformance = new Map<number, number>();
  readonly segmentByBanter = new Map<number, number>();
  readonly instrumentByInstrument = new Map<number, number>();
  /** Ids of the test show and its children: dropped by the test-show rule. */
  readonly testEvents = new Set<number>();
  readonly testSets = new Set<number>();
  readonly testPerformances = new Set<number>();

  // Lookups by name, filled when the lists are seeded.
  readonly list = {
    setType: new Map<string, number>(),
    showType: new Map<string, number>(),
    workKind: new Map<string, number>(),
    creditRole: new Map<string, number>(),
    referenceKind: new Map<string, number>(),
    linkSystem: new Map<string, number>(),
    recordingType: new Map<string, number>(),
    placeKind: new Map<string, number>(),
    showGroupKind: new Map<string, number>(),
    sourceKind: new Map<string, number>(),
    source: new Map<string, number>(),
  };
  readonly fixedPerson = { hunter: 0, audience: 0, curator: 0, claude: 0 };
  /** Every person key in use, so a duplicate gets a suffix (item 42). */
  readonly personKeys = new Set<string>();

  readonly legacy: Legacy;
  readonly db: PrismaClient;
  readonly settings: Settings;

  constructor(legacy: Legacy, db: PrismaClient, settings: Settings) {
    this.legacy = legacy;
    this.db = db;
    this.settings = settings;
  }

  /** Remember the old `created_at` of a new record and its entity row. */
  stamp(kind: EntityKind, id: number, at: Date | null): void {
    if (at !== null) this.createdDates.push({ kind, id, at });
  }

  /** Count a field the plan drops on purpose. The report lists the counts. */
  fieldDrop(rule: string): void {
    this.fieldDrops.set(rule, (this.fieldDrops.get(rule) ?? 0) + 1);
  }

  line(section: string, text: string): void {
    this.lines.push({ section, text });
  }

  propose(name: ProposalName, row: ProposalRow): void {
    this.proposals.get(name)?.push(row);
  }

  note(entityId: number, body: string | null, isPublic: boolean, legacyId: string): void {
    if (body !== null && body.trim() !== "") this.notes.push({ entityId, body, isPublic, legacyId });
  }

  /** Read and register an old table in one call. */
  async read(table: string): Promise<Row[]> {
    const rows = await this.legacy.rows(table);
    if (this.legacy.has(table)) this.tally.register(table, rows);
    return rows;
  }
}

/** Make entity rows and return their ids in the order of `flags` (each flag is `isPublic`). */
export async function newEntities(db: PrismaClient, kind: EntityKind, flags: boolean[]): Promise<number[]> {
  const ids: number[] = [];
  for (const part of chunk(flags, 2000)) {
    const made = await db.entity.createManyAndReturn({
      data: part.map((isPublic) => ({ kind, isPublic })),
      select: { id: true },
    });
    // One INSERT takes its ids from the sequence in row order, so the sorted ids follow the input.
    ids.push(...made.map((row) => row.id).sort((a, b) => a - b));
  }
  return ids;
}

/**
 * Make one record for each item: an entity row first, then the record with the same id.
 * `write` receives the items of one batch with their new ids. Returns the ids in item order.
 */
export async function bulk<T>(
  ctx: Ctx,
  kind: EntityKind,
  items: T[],
  write: (rows: Array<{ item: T; id: number }>) => Promise<unknown>,
  isPublic: (item: T) => boolean = () => true,
  createdAt: (item: T) => Date | null = () => null,
): Promise<number[]> {
  const all: number[] = [];
  for (const part of chunk(items, 1000)) {
    const ids = await newEntities(ctx.db, kind, part.map(isPublic));
    await write(part.map((item, index) => ({ item, id: ids[index] })));
    part.forEach((item, index) => ctx.stamp(kind, ids[index], createdAt(item)));
    all.push(...ids);
  }
  return all;
}

// The table of each entity kind that the import writes (names from `@@map` in the schema).
const TABLE_OF_KIND: Partial<Record<EntityKind, string>> = {
  SHOW: "shows",
  SET: "sets",
  SEGMENT: "segments",
  VOCAL_ENTRY: "vocal_entries",
  LINEUP_ENTRY: "lineup_entries",
  RECORDING: "recordings",
  PLACE: "places",
  PLACE_NAME: "place_names",
  BAND: "bands",
  PERSON: "people",
  WORK: "works",
  WORK_SINGER: "work_singers",
  CREDIT: "credits",
  REFERENCE: "references",
  SOURCE: "sources",
  SOURCE_WORK: "source_works",
};

/** Set the old creation date on each stamped record and on its entity row. */
export async function applyCreatedDates(ctx: Ctx): Promise<number> {
  const byKind = new Map<EntityKind, Array<{ id: number; at: Date }>>();
  for (const entry of ctx.createdDates) byKind.set(entry.kind, [...(byKind.get(entry.kind) ?? []), entry]);
  let count = 0;
  for (const [kind, entries] of byKind) {
    const table = TABLE_OF_KIND[kind];
    for (const part of chunk(entries, 5000)) {
      const ids = part.map((e) => e.id);
      const dates = part.map((e) => e.at.toISOString());
      await ctx.db.$executeRaw`UPDATE entities SET "createdAt" = v.at FROM (SELECT unnest(${ids}::int[]) AS id, unnest(${dates}::timestamp[]) AS at) v WHERE entities.id = v.id`;
      if (table) {
        await ctx.db.$executeRawUnsafe(
          `UPDATE "${table}" SET "createdAt" = v.at FROM (SELECT unnest($1::int[]) AS id, unnest($2::timestamp[]) AS at) v WHERE "${table}".id = v.id`,
          ids,
          dates,
        );
      }
      count += part.length;
    }
  }
  return count;
}

/** A unique person key from a name; a duplicate gets a number suffix (item 42). */
export function uniqueKey(ctx: Ctx, base: string): string {
  const root = base === "" ? "person" : base;
  let key = root;
  let n = 2;
  while (ctx.personKeys.has(key)) key = `${root}-${n++}`;
  ctx.personKeys.add(key);
  return key;
}
