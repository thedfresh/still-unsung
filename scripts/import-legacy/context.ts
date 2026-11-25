import type { Pool } from "pg";
import type { EntityKind } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { chunk, type Row } from "./rules.ts";

// Shared state of one import run: the old database (read only), the new database, the id maps
// from old rows to new records, and the collectors that feed the report and the proposals.

export interface Settings {
  /** Zotero keys of the three sources that must exist first (plan section 2). */
  zotero: { legacySetlistList: string; gdsets: string; whitegum: string };
  /** Sign-in emails of the two accounts (item 89). From the environment, never from the repo. */
  curatorEmail: string | null;
  agentEmail: string | null;
}

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
    const result = await this.pool.query<Row>(`SELECT * FROM "${this.schema}"."${table}" ORDER BY 1`);
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

export interface PendingCitation {
  entityId: number;
  aspect?: "SHOW_SETLIST" | "SHOW_DATE";
  sourceId?: number;
  recordingId?: number;
  contributorId?: number;
  place?: string | null;
  excerpt?: string | null;
  note?: string | null;
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
] as const;
export type ProposalName = (typeof PROPOSAL_NAMES)[number];

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
  readonly citations: PendingCitation[] = [];
  readonly externalIds: PendingExternalId[] = [];
  /** By old event id: whether the show is public, its band, and its row. */
  readonly eventPublic = new Map<number, boolean>();
  readonly eventBand = new Map<number, number | null>();
  readonly eventRow = new Map<number, Row>();
  readonly tally = new Tally();

  // Old id to new id, one map per kind of old row.
  readonly personByMusician = new Map<number, number | null>();
  readonly personByContributor = new Map<number, number>();
  readonly personByName = new Map<string, number>();
  readonly contributorByName = new Map<string, number>();
  readonly lineupByBandMusician = new Map<number, number>();
  /** Songs flagged as uncertain in the old data (item 90). */
  readonly uncertainSongs = new Set<number>();
  readonly bandByBand = new Map<number, number>();
  readonly placeByVenue = new Map<number, { placeId: number; nameId: number }>();
  readonly workBySong = new Map<number, number>();
  readonly showByEvent = new Map<number, number>();
  readonly setBySet = new Map<number, number>();
  readonly segmentByPerformance = new Map<number, number>();
  readonly segmentByBanter = new Map<number, number>();
  readonly recordingByRecording = new Map<number, number>();
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
): Promise<number[]> {
  const all: number[] = [];
  for (const part of chunk(items, 1000)) {
    const ids = await newEntities(ctx.db, kind, part.map(isPublic));
    await write(part.map((item, index) => ({ item, id: ids[index] })));
    all.push(...ids);
  }
  return all;
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
