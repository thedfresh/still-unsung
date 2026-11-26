import type { VocalRole } from "@/generated/prisma/enums";
import { bulk, type Ctx } from "./context.ts";
import type { SoloSegment } from "./step-segments.ts";
import { bool, dateOf, num, str, vocalRoleOf, type Row } from "./rules.ts";

// Step 4, last part: who sang (VocalEntry, items 33 and 83) and who played (LineupEntry,
// item 84: only exceptions are kept).

const TEST_RULE = "test-show-2099-12-20";
const REPEAT_RULE = "repeats-the-derived-lineup-with-no-notes (item 84)";

interface Member {
  personId: number;
  instruments: Set<number>;
  joined: Date | null;
  left: Date | null;
}

/** The derived lineup: for each person, the instruments and whether the person sings. */
type Baseline = Map<number, { instruments: Set<number>; sings: boolean }>;

function instrumentsByOwner(ctx: Ctx, rows: Row[], ownerField: string): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const row of rows) {
    const instrument = ctx.instrumentByInstrument.get(Number(row.instrument_id));
    if (instrument === undefined) continue;
    const owner = Number(row[ownerField]);
    out.set(owner, (out.get(owner) ?? new Set<number>()).add(instrument));
  }
  return out;
}

function activeAt(member: Member, event: Row): boolean {
  const year = num(event, "year");
  if (year === null) return true;
  const at = Date.UTC(year, (num(event, "month") ?? 1) - 1, num(event, "day") ?? 1);
  if (member.joined && member.joined.getTime() > at) return false;
  if (member.left && member.left.getTime() < at) return false;
  return true;
}

export async function importLineups(ctx: Ctx, solo: SoloSegment[]): Promise<void> {
  await importVocals(ctx);

  const sets = new Map((await ctx.read("sets")).map((row) => [Number(row.id), row]));
  const bandMembers = await ctx.read("band_musicians");
  const bandInstr = instrumentsByOwner(ctx, await ctx.read("band_musician_instruments"), "band_musician_id");
  const members = new Map<number, Member[]>();
  for (const row of bandMembers) {
    const personId = ctx.personByMusician.get(num(row, "musician_id") ?? -1);
    const bandId = num(row, "band_id");
    if (!personId || bandId === null) continue;
    const list = members.get(bandId) ?? [];
    const own = new Set(bandInstr.get(Number(row.id)) ?? []);
    const single = ctx.instrumentByInstrument.get(num(row, "instrument_id") ?? -1);
    if (single !== undefined) own.add(single);
    list.push({ personId, instruments: own, joined: dateOf(row, "joined_date"), left: dateOf(row, "left_date") });
    members.set(bandId, list);
  }
  // Every row is read: keepEntry records the rows under the test show as dropped (item: nothing lost).
  const eventMusicians = await ctx.read("event_musicians");
  const eventInstr = instrumentsByOwner(ctx, await ctx.read("event_musician_instruments"), "event_musician_id");
  const setMusicians = await ctx.read("set_musicians");
  const setInstr = instrumentsByOwner(ctx, await ctx.read("set_musician_instruments"), "set_musician_id");

  const entryInstruments = (row: Row, extra: Map<number, Set<number>>): Set<number> => {
    const own = new Set(extra.get(Number(row.id)) ?? []);
    const single = ctx.instrumentByInstrument.get(num(row, "instrument_id") ?? -1);
    if (single !== undefined) own.add(single);
    return own;
  };

  const bandBaseline = (bandOld: number | null, event: Row): Baseline => {
    const out: Baseline = new Map();
    for (const member of members.get(bandOld ?? -1) ?? []) {
      if (activeAt(member, event)) {
        out.set(member.personId, {
          instruments: new Set([...(out.get(member.personId)?.instruments ?? []), ...member.instruments]),
          sings: out.get(member.personId)?.sings ?? false,
        });
      }
    }
    return out;
  };
  const addAll = (target: Baseline, rows: Row[], match: (row: Row) => boolean, extra: Map<number, Set<number>>) => {
    for (const row of rows) {
      if (!match(row)) continue;
      const personId = ctx.personByMusician.get(num(row, "musician_id") ?? -1);
      if (!personId) continue;
      const known = target.get(personId);
      target.set(personId, {
        instruments: new Set([...(known?.instruments ?? []), ...entryInstruments(row, extra)]),
        sings: (known?.sings ?? false) || bool(row, "includes_vocals"),
      });
    }
  };
  // Item 84: only a row that repeats the person, the instruments and the vocals is a repeat.
  const repeats = (baseline: Baseline, personId: number, instruments: Set<number>, sings: boolean): boolean => {
    const known = baseline.get(personId);
    if (!known) return false;
    if (sings && !known.sings) return false;
    return instruments.size === 0 || [...instruments].every((instrument) => known.instruments.has(instrument));
  };

  // Show level.
  const showEntries = eventMusicians.filter((row) =>
    keepEntry(ctx, row, "event_musicians", ctx.showByEvent.has(Number(row.event_id)), () => {
      const event = ctx.eventRow.get(Number(row.event_id)) as Row;
      const personId = ctx.personByMusician.get(num(row, "musician_id") ?? -1) as number;
      return repeats(bandBaseline(ctx.eventBand.get(Number(row.event_id)) ?? null, event), personId, entryInstruments(row, eventInstr), bool(row, "includes_vocals"));
    }),
  );
  const showEntryIds = await writeEntries(ctx, showEntries, (row) => ({ showId: ctx.showByEvent.get(Number(row.event_id)) as number }), "event_musicians", eventInstr, ctx.eventPublic, (row) => Number(row.event_id));

  // Set level.
  const setEntries = setMusicians.filter((row) =>
    keepEntry(ctx, row, "set_musicians", ctx.setBySet.has(Number(row.set_id)), () => {
      const set = sets.get(Number(row.set_id)) as Row;
      const eventOld = Number(set.event_id);
      const event = ctx.eventRow.get(eventOld) as Row;
      const baseline = bandBaseline(num(set, "band_id") ?? ctx.eventBand.get(eventOld) ?? null, event);
      addAll(baseline, eventMusicians, (r) => Number(r.event_id) === eventOld, eventInstr);
      const personId = ctx.personByMusician.get(num(row, "musician_id") ?? -1) as number;
      return repeats(baseline, personId, entryInstruments(row, setInstr), bool(row, "includes_vocals"));
    }),
  );
  const setEntryIds = await writeEntries(ctx, setEntries, (row) => ({ setId: ctx.setBySet.get(Number(row.set_id)) as number }), "set_musicians", setInstr, ctx.eventPublic, (row) => Number((sets.get(Number(row.set_id)) as Row).event_id));

  markInstrumentRows(ctx, "event_musician_instruments", "event_musician_id", showEntryIds, await ctx.read("event_musician_instruments"));
  markInstrumentRows(ctx, "set_musician_instruments", "set_musician_id", setEntryIds, await ctx.read("set_musician_instruments"));
  await importSegmentLineups(ctx, {
    sets,
    eventMusicians,
    eventInstr,
    setMusicians,
    setInstr,
    bandBaseline,
    addAll,
    repeats,
    solo,
  });
}

/** Tally the old instrument rows: mapped when their lineup entry exists, listed otherwise. */
function markInstrumentRows(ctx: Ctx, table: string, ownerField: string, owners: Map<number, number>, rows: Row[]): void {
  for (const row of rows) {
    if (!owners.has(Number(row[ownerField]))) ctx.tally.drop(table, row.id, "its lineup entry was dropped (test show or item 84 repeat) or not migrated");
    else if (ctx.instrumentByInstrument.has(Number(row.instrument_id))) ctx.tally.mapped(table, row.id);
    else ctx.tally.notMapped(table, row.id, "its instrument was not migrated");
  }
}

/** Decide whether an old lineup row is kept; tally it when it is not. */
function keepEntry(ctx: Ctx, row: Row, table: string, parentOk: boolean, isRepeat: () => boolean): boolean {
  const id = Number(row.id);
  const musicianId = num(row, "musician_id");
  const personId = musicianId === null ? undefined : ctx.personByMusician.get(musicianId);
  // Every row under the test show is dropped by the test-show rule; nothing from it is imported.
  const isTest =
    table === "event_musicians"
      ? ctx.testEvents.has(Number(row.event_id))
      : table === "set_musicians"
        ? ctx.testSets.has(Number(row.set_id))
        : ctx.testPerformances.has(Number(row.performance_id));
  const hasNotes = str(row, "public_notes") !== null || str(row, "private_notes") !== null;
  if (isTest) ctx.tally.drop(table, id, TEST_RULE);
  else if (!parentOk) ctx.tally.notMapped(table, id, "its show, set or performance was not migrated");
  else if (!personId) ctx.tally.notMapped(table, id, "the musician is unknown or missing: a lineup entry needs a person");
  // A row with notes is never dropped: its notes would be lost (item 84: "only repeats").
  else if (!hasNotes && isRepeat()) ctx.tally.drop(table, id, REPEAT_RULE);
  else return true;
  return false;
}

async function writeEntries(
  ctx: Ctx,
  rows: Row[],
  owner: (row: Row) => { showId?: number; setId?: number; segmentId?: number },
  table: string,
  instruments: Map<number, Set<number>>,
  eventPublic: Map<number, boolean>,
  eventOf: (row: Row) => number,
): Promise<Map<number, number>> {
  const ids = await bulk(
    ctx,
    "LINEUP_ENTRY",
    rows,
    async (batch) => {
      await ctx.db.lineupEntry.createMany({
        data: batch.map(({ item, id }) => ({
          id,
          ...owner(item),
          personId: ctx.personByMusician.get(Number(item.musician_id)) as number,
          sings: bool(item, "includes_vocals"),
          legacyId: `${table}:${item.id}`,
        })),
      });
    },
    (row) => eventPublic.get(eventOf(row)) ?? true,
    (row) => dateOf(row, "created_at"),
  );
  const map = new Map<number, number>();
  rows.forEach((row, index) => {
    map.set(Number(row.id), ids[index]);
    ctx.tally.mapped(table, row.id);
    ctx.note(ids[index], str(row, "public_notes"), true, `${table}:${row.id}:publicNotes`);
    ctx.note(ids[index], str(row, "private_notes"), false, `${table}:${row.id}:privateNotes`);
  });
  const pairs = new Map<string, { lineupEntryId: number; instrumentId: number }>();
  for (const row of rows) {
    const lineupEntryId = map.get(Number(row.id)) as number;
    const own = new Set(instruments.get(Number(row.id)) ?? []);
    const single = ctx.instrumentByInstrument.get(num(row, "instrument_id") ?? -1);
    if (single !== undefined) own.add(single);
    for (const instrumentId of own) pairs.set(`${lineupEntryId}:${instrumentId}`, { lineupEntryId, instrumentId });
  }
  await ctx.db.lineupInstrument.createMany({ data: [...pairs.values()] });
  return map;
}

interface SegmentLineupInput {
  sets: Map<number, Row>;
  eventMusicians: Row[];
  eventInstr: Map<number, Set<number>>;
  setMusicians: Row[];
  setInstr: Map<number, Set<number>>;
  bandBaseline: (bandOld: number | null, event: Row) => Baseline;
  addAll: (target: Baseline, rows: Row[], match: (row: Row) => boolean, extra: Map<number, Set<number>>) => void;
  repeats: (baseline: Baseline, personId: number, instruments: Set<number>, sings: boolean) => boolean;
  solo: SoloSegment[];
}

async function importSegmentLineups(ctx: Ctx, input: SegmentLineupInput): Promise<void> {
  const performances = new Map((await ctx.read("performances")).map((row) => [Number(row.id), row]));
  const rows = await ctx.read("performance_musicians");
  const instruments = instrumentsByOwner(ctx, await ctx.read("performance_musician_instruments"), "performance_musician_id");
  const baselineOf = (performanceId: number): Baseline => {
    const performance = performances.get(performanceId) as Row;
    const setOld = Number(performance.set_id);
    const set = input.sets.get(setOld) as Row;
    const eventOld = Number(set.event_id);
    const baseline = input.bandBaseline(num(set, "band_id") ?? ctx.eventBand.get(eventOld) ?? null, ctx.eventRow.get(eventOld) as Row);
    input.addAll(baseline, input.eventMusicians, (r) => Number(r.event_id) === eventOld, input.eventInstr);
    input.addAll(baseline, input.setMusicians, (r) => Number(r.set_id) === setOld, input.setInstr);
    return baseline;
  };
  const eventOfPerformance = (row: Row) => Number((input.sets.get(Number((performances.get(Number(row.performance_id)) as Row).set_id)) as Row).event_id);

  // Item 121 (14): a row for the "Unknown" musician that sang is a vocal entry with no person. A
  // row that did not sing has no one to place, and stays listed as not mapped.
  const unknownSingers = rows.filter(
    (row) =>
      ctx.personByMusician.get(num(row, "musician_id") ?? -1) === null &&
      bool(row, "includes_vocals") &&
      ctx.segmentByPerformance.has(Number(row.performance_id)),
  );
  const unknownSingerIds = new Set(unknownSingers.map((row) => Number(row.id)));
  await bulk(
    ctx,
    "VOCAL_ENTRY",
    unknownSingers,
    async (batch) => {
      await ctx.db.vocalEntry.createMany({
        data: batch.map(({ item, id }) => ({
          id,
          segmentId: ctx.segmentByPerformance.get(Number(item.performance_id)) as number,
          personId: null,
          legacyId: `performance_musicians:${item.id}`,
        })),
      });
    },
    (row) => ctx.eventPublic.get(eventOfPerformance(row)) ?? true,
    (row) => dateOf(row, "created_at"),
  );
  for (const row of unknownSingers) {
    ctx.tally.mapped("performance_musicians", row.id);
    ctx.line("Unknown musicians that sang (vocal entry with no person, role lead by default)", `performance_musicians:${row.id}`);
  }

  const kept = rows.filter(
    (row) =>
      !unknownSingerIds.has(Number(row.id)) &&
      keepEntry(ctx, row, "performance_musicians", ctx.segmentByPerformance.has(Number(row.performance_id)), () => {
        const personId = ctx.personByMusician.get(num(row, "musician_id") ?? -1) as number;
        const own = new Set(instruments.get(Number(row.id)) ?? []);
        const single = ctx.instrumentByInstrument.get(num(row, "instrument_id") ?? -1);
        if (single !== undefined) own.add(single);
        return input.repeats(baselineOf(Number(row.performance_id)), personId, own, bool(row, "includes_vocals"));
      }),
  );
  const entryIds = await writeEntries(
    ctx,
    kept,
    (row) => ({ segmentId: ctx.segmentByPerformance.get(Number(row.performance_id)) as number }),
    "performance_musicians",
    instruments,
    ctx.eventPublic,
    eventOfPerformance,
  );
  markInstrumentRows(ctx, "performance_musician_instruments", "performance_musician_id", entryIds, await ctx.read("performance_musician_instruments"));

  // Solo Hunter (plan, Performance): everyone else in the lineup is absent on this segment.
  const present = new Set<string>();
  for (const row of kept) {
    present.add(`${ctx.segmentByPerformance.get(Number(row.performance_id))}:${ctx.personByMusician.get(Number(row.musician_id))}`);
  }
  const absent: Array<{ segmentId: number; personId: number; eventOld: number; oldId: number }> = [];
  for (const entry of input.solo) {
    const baseline = baselineOf(entry.oldId);
    let count = 0;
    for (const personId of baseline.keys()) {
      if (personId === ctx.fixedPerson.hunter || present.has(`${entry.segmentId}:${personId}`)) continue;
      const performance = performances.get(entry.oldId) as Row;
      absent.push({ segmentId: entry.segmentId, personId, eventOld: Number((input.sets.get(Number(performance.set_id)) as Row).event_id), oldId: entry.oldId });
      count += 1;
    }
    ctx.line("Solo Hunter segments", `performances:${entry.oldId}: ${count} other member(s) marked absent${count === 0 ? " (check: the lineup is unknown)" : ""}`);
  }
  await bulk(
    ctx,
    "LINEUP_ENTRY",
    absent,
    async (batch) => {
      await ctx.db.lineupEntry.createMany({
        data: batch.map(({ item, id }) => ({ id, segmentId: item.segmentId, personId: item.personId, absent: true, legacyId: `performances:${item.oldId}:isSoloHunter` })),
      });
    },
    (item) => ctx.eventPublic.get(item.eventOld) ?? true,
  );
}

async function importVocals(ctx: Ctx): Promise<void> {
  const performances = await ctx.read("performances");
  const vocalists = await ctx.read("performance_vocalists");
  const seen = new Set<string>();
  const wanted: Array<{ segmentId: number; personId: number | null; role: VocalRole; legacyId: string; eventOld: number; createdAt: Date | null }> = [];
  const sets = new Map((await ctx.read("sets")).map((row) => [Number(row.id), row]));
  const eventOfPerformance = (performanceId: number): number => {
    const performance = performances.find((row) => Number(row.id) === performanceId) as Row;
    return Number((sets.get(Number(performance.set_id)) as Row).event_id);
  };
  const add = (performanceId: number, musicianId: number | null, role: VocalRole, legacyId: string, createdAt: Date | null): boolean => {
    const segmentId = ctx.segmentByPerformance.get(performanceId);
    if (segmentId === undefined) return false;
    const mapped = musicianId === null ? null : ctx.personByMusician.get(musicianId);
    if (mapped === undefined) return false;
    const key = `${segmentId}:${mapped}:${role}`;
    if (!seen.has(key)) {
      seen.add(key);
      wanted.push({ segmentId, personId: mapped, role, legacyId, eventOld: eventOfPerformance(performanceId), createdAt });
    }
    return true;
  };
  for (const row of performances) {
    const lead = num(row, "lead_vocals_id");
    if (lead !== null) add(Number(row.id), lead, "LEAD", `performances:${row.id}:leadVocals`, dateOf(row, "created_at"));
  }
  for (const row of vocalists) {
    const performanceId = num(row, "performance_id") ?? -1;
    if (ctx.testPerformances.has(performanceId)) ctx.tally.drop("performance_vocalists", row.id, TEST_RULE);
    else {
      const role = vocalRoleOf(str(row, "vocal_role"));
      if (role === "UNKNOWN") {
        // The script does not guess a role: the row is listed, with its role text.
        ctx.tally.notMapped("performance_vocalists", row.id, "the vocal role text names no single role");
        ctx.line("Unknown vocal role text", `performance_vocalists:${row.id}: "${str(row, "vocal_role") ?? ""}"`);
      } else if (add(performanceId, num(row, "musician_id"), role, `performance_vocalists:${row.id}`, dateOf(row, "created_at"))) {
        ctx.tally.mapped("performance_vocalists", row.id);
      } else ctx.tally.notMapped("performance_vocalists", row.id, "its performance or musician was not migrated");
    }
  }
  await bulk(
    ctx,
    "VOCAL_ENTRY",
    wanted,
    async (batch) => {
      await ctx.db.vocalEntry.createMany({
        data: batch.map(({ item, id }) => ({ id, segmentId: item.segmentId, personId: item.personId, role: item.role, legacyId: item.legacyId })),
      });
    },
    (item) => ctx.eventPublic.get(item.eventOld) ?? true,
    (item) => item.createdAt,
  );
}
