import type { Prisma } from "@/generated/prisma/client";
import type { Certainty, ShowStatus } from "@/generated/prisma/enums";
import { HINT_LISTS, bulk, newEntities, type Ctx } from "./context.ts";
import { seededSetType, seededShowType } from "./lists.ts";
import {
  assignShowTiming,
  bool,
  dateOf,
  displayDateMatches,
  isBilledName,
  isSeasonDate,
  matchedText,
  noteHints,
  normalizeName,
  num,
  splitTimeOfDay,
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

/**
 * The date of an old event (item 22). A season ("Summer 1976") clears the month and the day and
 * keeps the written date. A time of day in the written date ("(Afternoon)") becomes a time label.
 */
function eventDate(row: Row): { year: number | null; month: number | null; day: number | null; display: string | null; label: string | null } {
  const split = splitTimeOfDay(str(row, "display_date"));
  const season = isSeasonDate(split.display);
  return {
    year: num(row, "year"),
    month: season ? null : num(row, "month"),
    day: season ? null : num(row, "day"),
    display: split.display,
    label: split.label,
  };
}

/** One old event credit: who it names and what the old row said (items 119, 120). */
interface LegacyCredit {
  name: string;
  description?: string;
  publicNotes?: string;
  privateNotes?: string;
}

/** Drop the keys that hold nothing. A show with nothing to archive gets no `legacyData`. */
function compact(data: Record<string, unknown>): Record<string, unknown> | null {
  const entries = Object.entries(data).filter(([, value]) => value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0));
  return entries.length === 0 ? null : Object.fromEntries(entries);
}

interface ShowPlan {
  row: Row;
  status: ShowStatus;
  showTypeId: number | null;
  isInterview: boolean;
  /** The public note without its "Contributor:" lines, and the names those lines held. */
  publicNote: string | null;
  lineNames: string[];
  legacyData: Record<string, unknown> | null;
}

/** The old event credits, by old event id. Each one is tallied here: mapped to the show archive. */
async function readLegacyCredits(ctx: Ctx, shown: Set<number>): Promise<Map<number, LegacyCredit[]>> {
  const names = new Map((await ctx.read("contributors")).map((row) => [Number(row.id), str(row, "name")]));
  const out = new Map<number, LegacyCredit[]>();
  for (const row of await ctx.read("event_contributors")) {
    const eventId = Number(row.event_id);
    const name = names.get(num(row, "contributor_id") ?? -1);
    if (ctx.testEvents.has(eventId)) ctx.tally.drop("event_contributors", row.id, TEST_RULE);
    else if (!shown.has(eventId) || name === undefined || name === null) ctx.tally.notMapped("event_contributors", row.id, "its show or contributor was not migrated");
    else {
      const credit: LegacyCredit = { name };
      const description = str(row, "description");
      const publicNotes = str(row, "public_notes");
      const privateNotes = str(row, "private_notes");
      if (description) credit.description = description;
      if (publicNotes) credit.publicNotes = publicNotes;
      if (privateNotes) credit.privateNotes = privateNotes;
      out.set(eventId, [...(out.get(eventId) ?? []), credit]);
      ctx.tally.mapped("event_contributors", row.id);
    }
  }
  return out;
}

export async function importShows(ctx: Ctx): Promise<void> {
  const events = await ctx.read("events");
  const sets = await ctx.read("sets");
  const eventTypes = new Map((await ctx.read("event_types")).map((row) => [Number(row.id), str(row, "name") ?? ""]));
  const contentTypes = new Map((await ctx.read("content_types")).map((row) => [Number(row.id), str(row, "name") ?? ""]));

  for (const row of events) if (isTestEvent(row)) ctx.testEvents.add(Number(row.id));
  const kept = events.filter((row) => !ctx.testEvents.has(Number(row.id)));
  for (const id of ctx.testEvents) ctx.tally.drop("events", id, TEST_RULE);
  const credits = await readLegacyCredits(ctx, new Set(kept.map((row) => Number(row.id))));

  // A show with an uncertain set, in 1975, gets an uncertain date as well (user, 2026-11-24).
  const eventsWithUncertainSet = new Set(sets.filter((row) => bool(row, "is_uncertain")).map((row) => Number(row.event_id)));
  const timing = assignShowTiming(
    kept.map((row) => {
      const date = eventDate(row);
      return { id: Number(row.id), year: date.year, month: date.month, day: date.day, timing: str(row, "show_timing") };
    }),
  );

  const plans: ShowPlan[] = kept.map((row) => {
    const oldId = Number(row.id);
    const eventType = eventTypes.get(num(row, "event_type_id") ?? -1) ?? "";
    const contentType = contentTypes.get(num(row, "content_type_id") ?? -1) ?? "";
    ctx.eventContentType.set(oldId, contentType);
    const errata = [eventType, contentType].some((name) => normalizeName(name) === "errata");
    const isInterview = [eventType, contentType].some((name) => normalizeName(name) === "interview");
    const typeName = eventType && normalizeName(eventType) !== "errata" ? (seededShowType(eventType) ?? eventType) : null;

    // Items 119, 120: a "Contributor:" line in the public note is an old-site credit. It leaves
    // the note and goes to the archive of the show, as text. No citation, no contributor record.
    const lineNames: string[] = [];
    const publicNote = str(row, "public_notes");
    const taken = publicNote
      ? takeContributorLines(publicNote, (name) => {
          lineNames.push(name);
          return 1;
        })
      : null;
    return {
      row,
      status: errata ? "SPURIOUS" : "TOOK_PLACE",
      showTypeId: typeName ? (ctx.list.showType.get(typeName) ?? null) : null,
      isInterview,
      publicNote: taken ? taken.remaining : null,
      lineNames,
      // Item 120: the credits, the raw entries, the old private notes, the billing text and the
      // etree show ID. Not the old "verified" flag.
      legacyData: compact({
        contributors: credits.get(oldId),
        contributorLinesInPublicNotes: lineNames,
        rawData: str(row, "raw_data"),
        rawDataGdsets: str(row, "raw_data_gdsets"),
        privateNotes: str(row, "private_notes"),
        billing: str(row, "billing"),
        etreeShowId: str(row, "etree_show_id"),
      }),
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
    (plan) => dateOf(plan.row, "created_at"),
  );
  plans.forEach((plan, index) => afterShow(ctx, plan, ids[index], timing.get(Number(plan.row.id))));
  await writeScheduledTimes(ctx, kept, ids, timing);
  await importSets(ctx, sets);
  for (const plan of plans.filter((p) => p.isInterview)) {
    ctx.interviewShows.push({ oldId: Number(plan.row.id), displayDate: str(plan.row, "display_date"), showTypeId: plan.showTypeId });
  }
  await importFestivals(ctx);
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
  const { year, month, day, display, label } = eventDate(row);
  const venue = ctx.placeByVenue.get(num(row, "venue_id") ?? -1);
  const billing = str(row, "billing");
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
    timeLabel: slot?.timeLabel ?? label,
    orderOnDate: slot?.orderOnDate ?? null,
    placeId: venue?.placeId ?? null,
    placeNameId: venue?.nameId ?? null,
    placeCertainty: certaintyOf(bool(row, "venue_uncertain")),
    // Item 15: only a true billed name. "Opened for…" and "Performed between…" go to the bill list.
    billedAs: billing !== null && isBilledName(billing) ? billing : null,
    legacyData: (plan.legacyData ?? undefined) as Prisma.InputJsonObject | undefined,
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
  if (slot?.unordered) ctx.line("Dates with several shows and no order (orderOnDate left empty)", `events:${oldId}`);
  if (slot?.ambiguousTime) ctx.line("Show times that cannot be read (time left empty; label kept as written)", `events:${oldId}`);
  if (slot?.scheduledTime) ctx.line("Shows with a clock time", `events:${oldId} at ${slot.scheduledTime}: cite its source`);
  if (bool(row, "verified")) ctx.fieldDrop("events.verified: not migrated (items 29, 120)");
  if (plan.legacyData) ctx.fieldDrop("shows.legacyData: filled (credits, raw entries, old private notes, billing, etree show ID)");
  if (plan.lineNames.length > 0) ctx.line("Contributor lines moved from public notes to the show archive", `events:${oldId}: ${plan.lineNames.length} line(s)`);
  if (bool(row, "is_uncertain")) {
    ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "isUncertain", migratedTo: "statusCertainty POSSIBLE" });
  }
  if (bool(row, "date_uncertain")) ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "dateUncertain", migratedTo: "dateCertainty POSSIBLE" });
  if (bool(row, "venue_uncertain")) ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "venueUncertain", migratedTo: "placeCertainty POSSIBLE" });
  if (bool(row, "hunter_participation_uncertain")) ctx.propose("15-old-uncertain-flags", { showId, legacyId: `events:${oldId}`, flag: "hunterParticipationUncertain", migratedTo: "hunterParticipationCertainty POSSIBLE" });
  if (plan.status === "SPURIOUS") ctx.line("Errata shows", `events:${oldId} became status SPURIOUS: check it`);
  const billing = str(row, "billing");
  if (billing) {
    const billed = isBilledName(billing);
    ctx.propose("01-bill", {
      showId,
      legacyId: `events:${oldId}`,
      proposal: billed ? "check the billing field" : "this billing text is not a billed name: it may name acts on the bill",
      source: "billing field",
      text: billing,
    });
    if (!billed) ctx.line("Billing text kept off billedAs (bill list only)", `events:${oldId}`);
  }

  const slug = str(row, "slug");
  if (slug) {
    ctx.addresses.push({ path: `/event/${slug}`, entityId: showId, slug });
    ctx.addresses.push({ path: `/shows/${slug}`, entityId: showId, slug });
  }

  // Notes. Items 119, 120: the contributor lines and the old private notes are in the show
  // archive, not in notes or citations. The rest of the public note stays a note.
  const remaining = plan.publicNote;
  ctx.note(showId, remaining, true, `events:${oldId}:publicNotes`);
  for (const [field, text] of [["publicNotes", remaining], ["privateNotes (in the show archive)", str(row, "private_notes")]] as const) {
    if (!text) continue;
    const base = { showId, legacyId: `events:${oldId}`, proposal: "check this note", source: field, text };
    for (const hint of noteHints(text)) ctx.propose(HINT_LISTS[hint], { ...base, matchedText: matchedText(text, hint) });
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
          // Item 16: the sets of a Poetry Reading show are readings.
          const reading = normalizeName(ctx.eventContentType.get(Number(item.event_id)) ?? "") === "poetry reading";
          const typeName = reading ? "Reading" : oldName ? (seededSetType(oldName) ?? oldName) : "Set";
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
    (row) => dateOf(row, "created_at"),
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
export async function importInterviews(ctx: Ctx): Promise<void> {
  for (const plan of ctx.interviewShows) {
    const oldId = plan.oldId;
    const showId = ctx.showByEvent.get(oldId) as number;
    const label = plan.displayDate ?? `events:${oldId}`;
    const isPublic = ctx.eventPublic.get(oldId) ?? true;
    // The work takes the show's own public or private setting.
    const [workId] = await newEntities(ctx.db, "WORK", [isPublic]);
    await ctx.db.work.create({
      data: { id: workId, title: `Interview (${label})`, workKindId: ctx.list.workKind.get("interview") as number, legacyId: `events:${oldId}:interview` },
    });
    // Item 96: use the show's existing set. Make one only when the show has none.
    let set = await ctx.db.set.findFirst({ where: { showId }, orderBy: { position: "asc" }, select: { id: true } });
    if (!set) {
      const [newSetId] = await newEntities(ctx.db, "SET", [isPublic]);
      set = await ctx.db.set.create({
        data: { id: newSetId, showId, position: 1, setTypeId: ctx.list.setType.get("Set") as number, legacyId: `events:${oldId}:interview` },
        select: { id: true },
      });
    }
    // The new segment goes last in the set: its key sorts after every key already there.
    const last = await ctx.db.segment.findFirst({ where: { setId: set.id }, orderBy: { sortKey: "desc" }, select: { sortKey: true } });
    const [segmentId] = await newEntities(ctx.db, "SEGMENT", [isPublic]);
    await ctx.db.segment.create({
      data: { id: segmentId, setId: set.id, sortKey: last ? `${last.sortKey}V` : "a0", delivery: "SPOKEN", workId, legacyId: `events:${oldId}:interview` },
    });
    ctx.propose("17-interview-show-types", { showId, legacyId: `events:${oldId}`, currentShowTypeId: plan.showTypeId });
    ctx.line("Interview shows", `events:${oldId}: made work ${workId} and spoken segment ${segmentId}`);
  }
}

/** A festival context becomes a show group of kind festival, with each show at that venue as a member. */
async function importFestivals(ctx: Ctx): Promise<void> {
  const kind = ctx.list.showGroupKind.get("festival") as number;
  const groupByName = new Map<string, number>();
  const members: Array<{ groupId: number; showId: number; legacyId: string }> = [];
  for (const [venueOld, name] of ctx.festivalByVenue) {
    let groupId = groupByName.get(normalizeName(name));
    if (groupId === undefined) {
      const [id] = await newEntities(ctx.db, "SHOW_GROUP", [true]);
      await ctx.db.showGroup.create({ data: { id, name, showGroupKindId: kind } });
      groupByName.set(normalizeName(name), id);
      groupId = id;
      ctx.line("Show groups made from venue contexts", `show group ${id} (festival) from venues:${venueOld}:context`);
    }
    for (const [eventOld, row] of ctx.eventRow) {
      const showId = ctx.showByEvent.get(eventOld);
      if (showId !== undefined && num(row, "venue_id") === venueOld) {
        members.push({ groupId, showId, legacyId: `events:${eventOld}:venueContext` });
      }
    }
  }
  await bulk(ctx, "SHOW_GROUP_MEMBER", members, async (batch) => {
    await ctx.db.showGroupMember.createMany({
      data: batch.map(({ item, id }) => ({ id, showGroupId: item.groupId, showId: item.showId })),
    });
  });
}
