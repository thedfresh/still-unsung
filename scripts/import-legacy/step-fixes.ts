import type { Ctx } from "./context.ts";
import { newEntities } from "./context.ts";
import { REVIEWED_ROWS, SEGMENT_FIXES, SET_NOTES, SHOWS_WITHOUT_HUNTER } from "./name-fixes.ts";

// Segment fixes the user made from the review lists (name-fixes.ts). Runs after segments exist.
export async function importSegmentFixes(ctx: Ctx): Promise<void> {
  for (const [performanceId, fix] of SEGMENT_FIXES) {
    const segmentId = ctx.segmentByPerformance.get(performanceId);
    if (segmentId === undefined) continue;
    const legacyId = `performances:${performanceId}`;
    if (fix.hunterAbsent) {
      // An absent lineup entry for Hunter on the segment (item 84; item 125 for why it stays).
      const [id] = await newEntities(ctx.db, "LINEUP_ENTRY", [true]);
      await ctx.db.lineupEntry.create({ data: { id, segmentId, personId: ctx.fixedPerson.hunter, absent: true, legacyId: `${legacyId}:hunterAbsent` } });
      ctx.line("Segment fixes from the review lists (name-fixes.ts)", `${legacyId}: Hunter absent`);
    }
    if (fix.delivery) {
      await ctx.db.segment.update({ where: { id: segmentId }, data: { delivery: fix.delivery } });
      ctx.line("Segment fixes from the review lists (name-fixes.ts)", `${legacyId}: delivery ${fix.delivery}`);
    }
    // The row leaves every list it was on, except the one a refile names (added there if missing).
    const target = fix.refile ? ctx.proposals.get(fix.refile) : undefined;
    const alreadyThere = target?.some((r) => r.legacyId === legacyId) ?? false;
    for (const [name, rows] of ctx.proposals) {
      if (name === fix.refile) continue;
      const here = rows.filter((r) => r.legacyId === legacyId);
      if (here.length === 0) continue;
      rows.splice(0, rows.length, ...rows.filter((r) => r.legacyId !== legacyId));
      if (target && !alreadyThere) for (const row of here) target.push({ ...row, refiledFrom: name });
    }
  }
  // Shows Hunter did not perform at: kept, with Hunter absent (item 125). Public or private stays
  // as on the old site until the user decides (HSA-195).
  for (const [oldEvent, why] of SHOWS_WITHOUT_HUNTER) {
    const showId = ctx.showByEvent.get(oldEvent);
    if (showId === undefined) continue;
    const [id] = await newEntities(ctx.db, "LINEUP_ENTRY", [true]);
    await ctx.db.lineupEntry.create({ data: { id, showId, personId: ctx.fixedPerson.hunter, absent: true, legacyId: `events:${oldEvent}:hunterAbsent` } });
    ctx.line("Shows without Hunter, listed (name-fixes.ts)", `events:${oldEvent}: ${why}`);
  }
  // Public notes on sets, such as a placeholder set Hunter did not play.
  for (const [oldSet, body] of SET_NOTES) {
    const setId = ctx.setBySet.get(oldSet);
    if (setId === undefined) continue;
    ctx.note(setId, body, true, `name-fixes:set:${oldSet}`);
    ctx.line("Set notes (name-fixes.ts)", `sets:${oldSet}: ${body}`);
  }
  // Rows the user settled with no data change leave their list.
  for (const [name, settled] of REVIEWED_ROWS) {
    const rows = ctx.proposals.get(name as Parameters<typeof ctx.proposals.get>[0]);
    if (!rows) continue;
    for (const [legacyId, why] of settled) {
      if (rows.some((r) => r.legacyId === legacyId)) ctx.line("Review-list rows settled with no data change (name-fixes.ts)", `${name} ${legacyId}: ${why}`);
    }
    rows.splice(0, rows.length, ...rows.filter((r) => !settled.has(String(r.legacyId))));
  }
}
