import type { Certainty, ShowStatus } from "@/generated/prisma/enums";
import { bulk, newEntities, type Ctx } from "./context.ts";
import { seededSetType, seededShowType } from "./lists.ts";
import {
  assignShowTiming,
  bool,
  contributorNamedIn,
  displayDateMatches,
  noteHints,
  normalizeName,
  num,
  str,
  takeContributorLines,
  type Row,
  type TimingResult,
} from "./rules.ts";

// Step 4, first half (plan section 4: Event, Set): shows and sets. Segments are in
// step-segments.ts.

const TEST_RULE = "test-show-2099-12-20";

function isTestEvent(row: Row): boolean {
  return num(row, "year") === 2099 && num(row, "month") === 12 && num(row, "day") === 20;
}

function certaintyOf(flag: boolean): Certainty {
  return flag ? "POSSIBLE" : "CONFIRMED";
}

interface ShowPlan {
  row: Row;
  status: ShowStatus;
  showTypeId: number | null;
  isInterview: boolean;
}

export async function importShows(ctx: Ctx): Promise<void> {
  const events = await ctx.read("events");
  const sets = await ctx.read("sets");
  const eventTypes = new Map((await ctx.read("event_types")).map((row) => [Number(row.id), str(row, "name") ?? ""]));
  const contentTypes = new Map((await ctx.read("content_types")).map((row) => [Number(row.id), str(row, "name") ?? ""]));

  for (const row of events) if (isTestEvent(row)) ctx.testEvents.add(Number(row.id));
  const kept = events.filter((row) => !ctx.testEvents.has(Number(row.id)));
  for (const id of ctx.testEvents) ctx.tally.drop("events", id, TEST_RULE);

  // A show with an uncertain set, in 1975, gets an uncertain date as well (user, 2026-11-24).
  const eventsWithUncertainSet = new Set(sets.filter((row) => bool(row, "is_uncertain")).map((row) => Number(row.event_id)));
  const timing = assignShowTiming(
    kept.map((row) => ({
      id: Number(row.id),
      year: num(row, "year"),
      month: num(row, "month"),
      day: num(row, "day"),
      timing: str(row, "show_timing"),
    })),
  );

  const plans: ShowPlan[] = kept.map((row) => {
    const eventType = eventTypes.get(num(row, "event_type_id") ?? -1) ?? "";
    const contentType = contentTypes.get(num(row, "content_type_id") ?? -1) ?? "";
    const errata = [eventType, contentType].some((name) => normalizeName(name) === "errata");
    const isInterview = [eventType, contentType].some((name) => normalizeName(name) === "interview");
    const typeName = eventType && normalizeName(eventType) !== "errata" ? (seededShowType(eventType) ?? eventType) : null;
    return {
      row,
      status: errata ? "SPURIOUS" : "TOOK_PLACE",
      showTypeId: typeName ? (ctx.list.showType.get(typeName) ?? null) : null,
      isInterview,
    };
  });

  const ids = await bulk(
    ctx,
    "SHOW",
    plans,
    async (batch) => {
      await ctx.db.show.createMany({ data: batch.map(({ item, id }) => showData(ctx, item, id, timing, eventsWithUncertainSet)) });
    },
    (plan) => plan.row.is_public === undefined || bool(plan.row, "is_public"),
  );
  plans.forEach((plan, index) => afterShow(ctx, plan, ids[index], timing.get(Number(plan.row.id))));
  await writeScheduledTimes(ctx, kept, ids, timing);
  writeCitationsAndIds(ctx, plans, ids);
  await importSets(ctx, sets);
  await importInterviews(ctx, plans);
}

function showData(
  ctx: Ctx,
  plan: ShowPlan,
  id: number,
  timing: ReturnType<typeof assignShowTiming>,
  uncertainSetEvents: Set<number>,
) {
  const row = plan.row;
  const oldId = Number(row.id);
  const year = num(row, "year");
  const month = num(row, "month");
  const day = num(row, "day");
  const display = str(row, "display_date");
  const venue = ctx.placeByVenue.get(num(row, "venue_id") ?? -1);
  const slot = timing.get(oldId);
  const uncertain = bool(row, "is_uncertain");
  const dateUncertain = bool(row, "date_uncertain") || (uncertain && year === 1975 && uncertainSetEvents.has(oldId));
  return {
    id,
    dateYear: year,
    dateMonth: month,
    dateDay: day,
    dateAsWritten: display && !displayDateMatches(display, year, month, day) ? display : null,
    dateCertainty: certaintyOf(dateUncertain),
    timeLabel: slot?.timeLabel ?? null,
    orderOnDate: slot?.orderOnDate ?? null,
    placeId: venue?.placeId ?? null,
    placeNameId: venue?.nameId ?? null,
    placeCertainty: certaintyOf(bool(row, "venue_uncertain")),
    billedAs: str(row, "billing"),
    bandId: ctx.bandByBand.get(num(row, "primary_band_id") ?? -1) ?? null,
    showTypeId: plan.showTypeId,
    status: plan.status,
    statusCertainty: certaintyOf(uncertain),
    hunterParticipationCertainty: certaintyOf(bool(row, "hunter_participation_uncertain")),
    slug: str(row, "slug"),
    legacyId: `events:${oldId}`,
  };
}

function afterShow(ctx: Ctx, plan: ShowPlan, showId: number, slot: TimingResult | undefined): void {
  const row = plan.row;
  const oldId = Number(row.id);
  ctx.showByEvent.set(oldId, showId);
  ctx.eventRow.set(oldId, row);
  ctx.eventPublic.set(oldId, row.is_public === undefined || bool(row, "is_public"));
  ctx.eventBand.set(oldId, num(row, "primary_band_id"));
  ctx.tally.mapped("events", oldId);
  if (slot?.unpaired) ctx.line("Unpaired Early or Late shows", `events:${oldId}`);
  if (slot?.scheduledTime) ctx.line("Shows with a clock time", `events:${oldId} at ${slot.scheduledTime}: cite its source`);
  if (bool(row, "verified")) ctx.fieldDrop("events.verified: not migrated (item 29)");
  if (bool(row, "is_uncertain")) {
    ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "isUncertain", migratedTo: "statusCertainty POSSIBLE" });
  }
  if (bool(row, "date_uncertain")) ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "dateUncertain", migratedTo: "dateCertainty POSSIBLE" });
  if (bool(row, "venue_uncertain")) ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "venueUncertain", migratedTo: "placeCertainty POSSIBLE" });
  if (bool(row, "hunter_participation_uncertain")) ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "hunterParticipationUncertain", migratedTo: "hunterParticipationCertainty POSSIBLE" });
  if (plan.status === "SPURIOUS") ctx.line("Errata shows", `events:${oldId} became status SPURIOUS: check it`);
  if (str(row, "billing")) ctx.propose("01-bill", { showId, legacyId: `events:${oldId}`, source: "billing field", text: str(row, "billing") });

  const slug = str(row, "slug");
  if (slug) {
    ctx.addresses.push({ path: `/event/${slug}`, entityId: showId, slug });
    ctx.addresses.push({ path: `/shows/${slug}`, entityId: showId, slug });
  }

  // Notes: contributor lines become citations (item 102); the rest stays a note.
  const publicNote = str(row, "public_notes");
  let remaining = publicNote;
  if (publicNote) {
    const out = takeContributorLines(publicNote, (name) => ctx.contributorByName.get(normalizeName(name)) ?? null);
    remaining = out.remaining;
    out.matched.forEach((contributorId, index) =>
      ctx.citations.push({ entityId: showId, contributorId, legacyId: `events:${oldId}:publicNotes:${index}` }),
    );
    if (out.unmatched > 0) ctx.line("Contributor lines left in notes", `events:${oldId}: ${out.unmatched} line(s)`);
  }
  ctx.note(showId, remaining, true, `events:${oldId}:publicNotes`);
  ctx.note(showId, str(row, "private_notes"), false, `events:${oldId}:privateNotes`);
  for (const [field, text] of [["publicNotes", remaining], ["privateNotes", str(row, "private_notes")]] as const) {
    if (!text) continue;
    const hints = noteHints(text);
    if (hints.includes("bill")) ctx.propose("01-bill", { showId, legacyId: `events:${oldId}`, source: field, text });
    if (hints.includes("guest")) ctx.propose("14-guests-in-notes", { showId, legacyId: `events:${oldId}`, source: field, text });
    if (hints.includes("a-cappella")) ctx.propose("13-a-cappella", { showId, legacyId: `events:${oldId}`, source: field });
  }
}

async function writeScheduledTimes(
  ctx: Ctx,
  kept: Row[],
  ids: number[],
  timing: ReturnType<typeof assignShowTiming>,
): Promise<void> {
  // Prisma holds a Time as a JS Date and cannot write "24:00:00", so the times go in as text.
  for (const [index, row] of kept.entries()) {
    const time = timing.get(Number(row.id))?.scheduledTime;
    if (time) await ctx.db.$executeRaw`UPDATE shows SET "scheduledTime" = ${time}::time WHERE id = ${ids[index]}`;
  }
}

function writeCitationsAndIds(ctx: Ctx, plans: ShowPlan[], ids: number[]): void {
  const unmatched: number[] = [];
  plans.forEach((plan, index) => {
    const row = plan.row;
    const oldId = Number(row.id);
    const showId = ids[index];
    for (const [field, sourceKey] of [
      ["raw_data", "legacy-setlist-list"],
      ["raw_data_gdsets", "gdsets"],
    ] as const) {
      const raw = str(row, field);
      if (!raw) continue;
      const named = contributorNamedIn(raw);
      const contributorId = named ? ctx.contributorByName.get(normalizeName(named)) : undefined;
      if (!contributorId) unmatched.push(oldId);
      ctx.citations.push({
        entityId: showId,
        sourceId: ctx.list.source.get(sourceKey) as number,
        contributorId,
        excerpt: raw,
        legacyId: `events:${oldId}:${field === "raw_data" ? "rawData" : "rawDataGdsets"}`,
      });
    }
    const etree = str(row, "etree_show_id");
    if (etree) ctx.externalIds.push({ entityId: showId, system: "EtreeDB", value: etree, legacyId: `events:${oldId}:etreeShowId` });
  });
  if (unmatched.length > 0) ctx.line("Raw entries with no matched contributor", `${unmatched.length} entries: events ${[...new Set(unmatched)].join(", ")}`);
}

async function importSets(ctx: Ctx, sets: Row[]): Promise<void> {
  const oldTypes = new Map((await ctx.read("set_types")).map((row) => [Number(row.id), str(row, "name") ?? ""]));
  const recordings = new Set((await ctx.read("recordings")).map((row) => num(row, "event_id")));
  const kept = sets.filter((row) => {
    const id = Number(row.id);
    if (ctx.testEvents.has(Number(row.event_id))) {
      ctx.testSets.add(id);
      ctx.tally.drop("sets", id, TEST_RULE);
      return false;
    }
    if (!ctx.showByEvent.has(Number(row.event_id))) {
      ctx.tally.notMapped("sets", id, "its event was not migrated");
      return false;
    }
    return true;
  });
  const ids = await bulk(
    ctx,
    "SET",
    kept,
    async (batch) => {
      await ctx.db.set.createMany({
        data: batch.map(({ item, id }) => {
          const oldName = oldTypes.get(num(item, "set_type_id") ?? -1);
          const typeName = oldName ? (seededSetType(oldName) ?? oldName) : "Set";
          return {
            id,
            showId: ctx.showByEvent.get(Number(item.event_id)) as number,
            position: num(item, "position") ?? 1,
            setTypeId: (ctx.list.setType.get(typeName) ?? ctx.list.setType.get("Set")) as number,
            bandId: ctx.bandByBand.get(num(item, "band_id") ?? -1) ?? null,
            legacyId: `sets:${item.id}`,
          };
        }),
      });
    },
    (row) => ctx.eventPublic.get(Number(row.event_id)) ?? true,
  );
  kept.forEach((row, index) => {
    const oldId = Number(row.id);
    ctx.setBySet.set(oldId, ids[index]);
    ctx.tally.mapped("sets", oldId);
    ctx.note(ids[index], str(row, "public_notes"), true, `sets:${oldId}:publicNotes`);
    ctx.note(ids[index], str(row, "private_notes"), false, `sets:${oldId}:privateNotes`);
    if (bool(row, "is_uncertain")) ctx.line("Sets with an old uncertain flag (not stored)", `sets:${oldId}`);
    const oldName = oldTypes.get(num(row, "set_type_id") ?? -1);
    if (oldName && normalizeName(oldName) === "partial set") {
      ctx.propose("10-incomplete-setlists", {
        setId: ids[index],
        legacyId: `sets:${oldId}`,
        suggestedReason: recordings.has(Number(row.event_id)) ? "inferred from the tape" : "assumed",
      });
    }
  });
}

/** Item 96: an interview show gets one interview work and one spoken segment. */
async function importInterviews(ctx: Ctx, plans: ShowPlan[]): Promise<void> {
  const interviews = plans.filter((plan) => plan.isInterview);
  for (const plan of interviews) {
    const oldId = Number(plan.row.id);
    const showId = ctx.showByEvent.get(oldId) as number;
    const label = str(plan.row, "display_date") ?? `events:${oldId}`;
    const [workId] = await newEntities(ctx.db, "WORK", [true]);
    await ctx.db.work.create({
      data: { id: workId, title: `Interview (${label})`, workKindId: ctx.list.workKind.get("interview") as number, legacyId: `events:${oldId}:interview` },
    });
    const [setId] = await newEntities(ctx.db, "SET", [ctx.eventPublic.get(oldId) ?? true]);
    const last = await ctx.db.set.aggregate({ where: { showId }, _max: { position: true } });
    await ctx.db.set.create({
      data: { id: setId, showId, position: (last._max.position ?? 0) + 1, setTypeId: ctx.list.setType.get("Set") as number, legacyId: `events:${oldId}:interview` },
    });
    const [segmentId] = await newEntities(ctx.db, "SEGMENT", [ctx.eventPublic.get(oldId) ?? true]);
    await ctx.db.segment.create({
      data: { id: segmentId, setId, sortKey: "a0", delivery: "SPOKEN", workId, legacyId: `events:${oldId}:interview` },
    });
    ctx.propose("17-interview-show-types", { showId, legacyId: `events:${oldId}`, currentShowTypeId: plan.showTypeId });
    ctx.line("Interview shows", `events:${oldId}: made work ${workId} and spoken segment ${segmentId}`);
  }
}
