import type { Delivery, Extent } from "@/generated/prisma/enums";
import { bulk, type Ctx } from "./context.ts";
import { bool, footnoteKinds, noteHints, num, sortKeys, str, type Row } from "./rules.ts";

// Step 4, second half (plan section 4: Performance, ShowBanter): every performance becomes a
// segment; every banter row becomes a spoken segment next to its performance (item 37).

const TEST_RULE = "test-show-2099-12-20";

type Item =
  | { kind: "performance"; row: Row; setOld: number; sortKey: string }
  | { kind: "banter"; row: Row; setOld: number; sortKey: string };

export interface SoloSegment {
  segmentId: number;
  setOld: number;
  oldId: number;
}

function extentOf(row: Row): Extent {
  if (bool(row, "is_aborted")) return "ABORTED";
  if (bool(row, "is_partial")) return "PARTIAL";
  if (bool(row, "is_lyrical_fragment")) return "FRAGMENT";
  return "COMPLETE";
}

export async function importSegments(ctx: Ctx): Promise<SoloSegment[]> {
  const performances = await ctx.read("performances");
  const banters = await ctx.read("show_banter");
  const songs = new Map((await ctx.read("songs")).map((row) => [Number(row.id), row]));
  const sets = await ctx.read("sets");
  const eventOfSet = new Map(sets.map((row) => [Number(row.id), Number(row.event_id)]));

  const bySet = new Map<number, Row[]>();
  for (const row of performances) {
    const id = Number(row.id);
    const setOld = Number(row.set_id);
    if (ctx.testSets.has(setOld)) {
      ctx.testPerformances.add(id);
      ctx.tally.drop("performances", id, TEST_RULE);
    } else if (!ctx.setBySet.has(setOld) || !ctx.workBySong.has(Number(row.song_id))) {
      ctx.tally.notMapped("performances", id, ctx.setBySet.has(setOld) ? "its song was not migrated" : "its set was not migrated");
    } else {
      bySet.set(setOld, [...(bySet.get(setOld) ?? []), row]);
    }
  }
  const banterByPerformance = new Map<number, Row[]>();
  for (const row of banters) {
    const performanceId = Number(row.performance_id);
    if (ctx.testPerformances.has(performanceId)) {
      ctx.tally.drop("show_banter", row.id, TEST_RULE);
      continue;
    }
    banterByPerformance.set(performanceId, [...(banterByPerformance.get(performanceId) ?? []), row]);
  }

  const items: Item[] = [];
  for (const [setOld, rows] of bySet) {
    const ordered = [...rows].sort((a, b) => (num(a, "performance_order") ?? 0) - (num(b, "performance_order") ?? 0) || Number(a.id) - Number(b.id));
    const sequence: Array<Omit<Item, "sortKey">> = [];
    for (const row of ordered) {
      const around = banterByPerformance.get(Number(row.id)) ?? [];
      for (const banter of around.filter((b) => bool(b, "is_before_song"))) sequence.push({ kind: "banter", row: banter, setOld });
      sequence.push({ kind: "performance", row, setOld });
      for (const banter of around.filter((b) => !bool(b, "is_before_song"))) sequence.push({ kind: "banter", row: banter, setOld });
    }
    const keys = sortKeys(sequence.length);
    sequence.forEach((entry, index) => items.push({ ...entry, sortKey: keys[index] } as Item));
  }
  const handled = new Set(items.filter((i) => i.kind === "banter").map((i) => Number(i.row.id)));
  for (const row of banters) {
    if (!handled.has(Number(row.id)) && !ctx.testPerformances.has(Number(row.performance_id))) {
      ctx.tally.notMapped("show_banter", row.id, "its performance was not migrated");
    }
  }

  const solo: SoloSegment[] = [];
  const ids = await bulk(
    ctx,
    "SEGMENT",
    items,
    async (batch) => {
      await ctx.db.segment.createMany({
        data: batch.map(({ item, id }) => segmentData(ctx, item, id, songs)),
      });
    },
    (item) => ctx.eventPublic.get(eventOfSet.get(item.setOld) ?? -1) ?? true,
  );

  items.forEach((item, index) => {
    const segmentId = ids[index];
    const oldId = Number(item.row.id);
    if (item.kind === "banter") {
      ctx.segmentByBanter.set(oldId, segmentId);
      ctx.tally.mapped("show_banter", oldId);
      ctx.note(segmentId, str(item.row, "public_notes"), true, `show_banter:${oldId}:publicNotes`);
      ctx.note(segmentId, str(item.row, "private_notes"), false, `show_banter:${oldId}:privateNotes`);
      ctx.propose("03-banter-summaries", {
        segmentId,
        legacyId: `show_banter:${oldId}`,
        oldIsVerbatim: bool(item.row, "is_verbatim"),
        length: (str(item.row, "banter_text") ?? "").length,
      });
      return;
    }
    ctx.segmentByPerformance.set(oldId, segmentId);
    ctx.tally.mapped("performances", oldId);
    afterPerformance(ctx, item.row, segmentId);
    if (bool(item.row, "is_solo_hunter")) solo.push({ segmentId, setOld: item.setOld, oldId });
  });

  // A segment that runs into a next one that does not exist (end of its set).
  const lastOfSet = new Map<number, number>();
  items.forEach((item, index) => lastOfSet.set(item.setOld, index));
  for (const index of lastOfSet.values()) {
    const item = items[index];
    if (item.kind === "performance" && bool(item.row, "segues_into")) {
      ctx.line("Segments that run into nothing", `performances:${item.row.id}: last in its set`);
    }
  }
  return solo;
}

function segmentData(ctx: Ctx, item: Item, id: number, songs: Map<number, Row>) {
  const setId = ctx.setBySet.get(item.setOld) as number;
  if (item.kind === "banter") {
    return {
      id,
      setId,
      sortKey: item.sortKey,
      delivery: "SPOKEN" as Delivery,
      // Safe default: the text is the words as heard. Whether it is a summary is a proposal.
      wordsAsHeard: str(item.row, "banter_text"),
      legacyId: `show_banter:${item.row.id}`,
    };
  }
  const row = item.row;
  const song = songs.get(Number(row.song_id));
  const played = bool(row, "is_instrumental") || bool(row, "is_musical_fragment") || (song ? bool(song, "is_instrumental") : false);
  const uncertain = bool(row, "is_uncertain") || ctx.uncertainSongs.has(Number(row.song_id));
  return {
    id,
    setId,
    sortKey: item.sortKey,
    joinsNext: bool(row, "segues_into") ? ("RUNS_INTO" as const) : ("STOPS" as const),
    delivery: played ? ("PLAYED" as Delivery) : null,
    workId: ctx.workBySong.get(Number(row.song_id)) as number,
    workCertainty: uncertain ? ("POSSIBLE" as const) : ("CONFIRMED" as const),
    extent: extentOf(row),
    cutAtStart: bool(row, "is_truncated_start"),
    cutAtEnd: bool(row, "is_truncated_end"),
    hasGaps: bool(row, "has_cuts"),
    legacyId: `performances:${row.id}`,
  };
}

function afterPerformance(ctx: Ctx, row: Row, segmentId: number): void {
  const oldId = Number(row.id);
  const flags = ["is_aborted", "is_partial", "is_lyrical_fragment"].filter((flag) => bool(row, flag));
  if (flags.length > 1) ctx.line("Performances with several extent flags", `performances:${oldId}: ${flags.join(", ")}; the first rule won`);
  if (bool(row, "is_medley")) ctx.fieldDrop("performances.is_medley: derived from the joins (plan, Performance)");
  if (bool(row, "is_musical_fragment")) ctx.propose("16-musical-fragments", { segmentId, legacyId: `performances:${oldId}` });
  if (bool(row, "is_uncertain") || ctx.uncertainSongs.has(Number(row.song_id))) {
    ctx.propose("15-old-uncertain-flags", { segmentId, legacyId: `performances:${oldId}`, flag: "isUncertain", migratedTo: "workCertainty POSSIBLE" });
  }
  const lyrical = str(row, "lyrical_variation");
  if (lyrical) {
    ctx.note(segmentId, `Lyrical variation: ${lyrical}`, true, `performances:${oldId}:lyricalVariation`);
    ctx.line("Lyrical variations kept as notes", `performances:${oldId}`);
  }
  for (const [field, camel, isPublic] of [
    ["public_notes", "publicNotes", true],
    ["public_notes_expanded", "publicNotesExpanded", true],
    ["private_notes", "privateNotes", false],
  ] as const) {
    const text = str(row, field);
    if (!text) continue;
    ctx.note(segmentId, text, isPublic, `performances:${oldId}:${camel}`);
    const kinds = footnoteKinds(text);
    if (kinds.length > 0) ctx.propose("04-typed-footnotes", { segmentId, legacyId: `performances:${oldId}`, kinds: kinds.join(",") });
    const hints = noteHints(text);
    if (hints.includes("a-cappella")) ctx.propose("13-a-cappella", { segmentId, legacyId: `performances:${oldId}`, source: camel });
    if (hints.includes("guest")) ctx.propose("14-guests-in-notes", { segmentId, legacyId: `performances:${oldId}`, source: camel });
  }
}
