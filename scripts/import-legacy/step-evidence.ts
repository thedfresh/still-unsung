import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Ctx } from "./context.ts";
import {
  LINK_SYSTEMS,
  bool,
  csvLine,
  dateOf,
  externalValue,
  findUrls,
  num,
  rewriteSongLinks,
  routeLink,
  str,
  whitegumValue,
  type Row,
} from "./rules.ts";

// Steps 5 to 8: recording candidates, links and outside IDs, notes, backlinks and addresses.

const TEST_RULE = "test-show-2099-12-20";
const CANDIDATE_RULE = "recording-candidate-only: listed in candidates-recordings.csv (item 118)";

export const CANDIDATES_FILE = "candidates-recordings.csv";

const CANDIDATE_COLUMNS = [
  "showId",
  "showDate",
  "oldEventId",
  "oldRecordingId",
  "recordingType",
  "description",
  "taper",
  "lengthMinutes",
  "linkSystem",
  "value",
  "url",
  "linkTitle",
  "linkDescription",
  "oldLinkId",
  "linkIsActive",
  "linkIsPublic",
  "featured",
  "featuredText",
  "contributor",
  "publicNotes",
  "privateNotes",
];

/** The recording fields that hold an old link: the field, the link system and its URL template. */
const RECORDING_LINK_FIELDS = [
  ["shn_id", "SHN"],
  ["lma_identifier", "Live Music Archive"],
  ["lossless_legs_id", "Lossless Legs"],
  ["youtube_video_id", "YouTube"],
  ["url", "Old recording URL"],
] as const;

/** An old SHN ID is an EtreeDB show ID: its address uses the EtreeDB template. */
function fullUrl(system: string, value: string): string {
  const name = system === "SHN" ? "EtreeDB" : system;
  const template = LINK_SYSTEMS.find((entry) => entry.system === name)?.urlTemplate;
  return template ? template.replace("{value}", value) : "";
}

/** A stray tab or space, a doubled slash and a slash at either end are typing slips in an old value. */
function cleanValue(value: string): string {
  const trimmed = value.replace(/[\t\r\n]+/g, " ").trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return trimmed.replace(/\/{2,}/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

function partialDate(row: Row): string {
  const parts = [num(row, "year"), num(row, "month"), num(row, "day")];
  return parts
    .filter((part): part is number => part !== null)
    .map((part, index) => (index === 0 ? String(part) : String(part).padStart(2, "0")))
    .join("-");
}

/**
 * Item 118: the old recordings and their links are candidates, not data. The import makes no
 * Recording row, and no outside ID on a recording. It writes one CSV row for each old link to a
 * private file next to the other private output. A recording holds up to five links of its own
 * (SHN, Lossless Legs, Live Music Archive, YouTube and the old URL); the `links` table adds more.
 * The file may hold private notes: it stays out of git.
 */
export async function importRecordingCandidates(ctx: Ctx, outputDir: string): Promise<number> {
  const recordings = await ctx.read("recordings");
  const links = await ctx.read("links");
  const linkTypes = new Map((await ctx.read("link_types")).map((row) => [Number(row.id), str(row, "name")]));
  const recordingTypes = new Map((await ctx.read("recording_types")).map((row) => [Number(row.id), str(row, "name")]));
  const contributors = new Map((await ctx.read("contributors")).map((row) => [Number(row.id), str(row, "name")]));

  const lines = [csvLine(CANDIDATE_COLUMNS)];
  const byRecording = new Map<number, Row>();
  const row = (recording: Row, link: Partial<Record<(typeof CANDIDATE_COLUMNS)[number], string | number | boolean | null>>) => {
    const eventId = Number(recording.event_id);
    const event = ctx.eventRow.get(eventId) as Row;
    lines.push(
      csvLine([
        ctx.showByEvent.get(eventId),
        partialDate(event),
        eventId,
        Number(recording.id),
        recordingTypes.get(num(recording, "recording_type_id") ?? -1) ?? "",
        str(recording, "description"),
        str(recording, "taper"),
        num(recording, "length_minutes"),
        link.linkSystem,
        link.value,
        link.url,
        link.linkTitle,
        link.linkDescription,
        link.oldLinkId,
        link.linkIsActive,
        link.linkIsPublic,
        bool(recording, "featured"),
        str(recording, "featured_text"),
        contributors.get(num(recording, "contributor_id") ?? -1) ?? "",
        str(recording, "public_notes"),
        str(recording, "private_notes"),
      ]),
    );
  };

  let candidateLinks = 0;
  let withoutLink = 0;
  for (const recording of recordings) {
    const id = Number(recording.id);
    const eventId = Number(recording.event_id);
    if (ctx.testEvents.has(eventId)) ctx.tally.drop("recordings", id, TEST_RULE);
    else if (!ctx.showByEvent.has(eventId)) ctx.tally.notMapped("recordings", id, "its event was not migrated");
    else {
      byRecording.set(id, recording);
      ctx.tally.drop("recordings", id, CANDIDATE_RULE);
      let own = 0;
      for (const [field, system] of RECORDING_LINK_FIELDS) {
        const value = cleanValue(str(recording, field) ?? "");
        if (!value) continue;
        own += 1;
        row(recording, { linkSystem: system, value, url: field === "url" ? value : fullUrl(system, value) });
      }
      candidateLinks += own;
      if (own === 0) withoutLink += 1;
    }
  }
  for (const link of links) {
    const recordingId = num(link, "recording_id");
    if (recordingId === null) continue;
    const linkId = Number(link.id);
    const recording = byRecording.get(recordingId);
    if (recording === undefined) {
      const known = recordings.find((candidate) => Number(candidate.id) === recordingId);
      if (known && ctx.testEvents.has(Number(known.event_id))) ctx.tally.drop("links", linkId, TEST_RULE);
      else ctx.tally.notMapped("links", linkId, "its recording was not migrated");
      ctx.recordingLinkIds.add(linkId);
      continue;
    }
    const url = str(link, "url") ?? "";
    const route = url ? routeLink(url, linkTypes.get(num(link, "link_type_id") ?? -1) ?? null) : null;
    const system = route?.kind === "external" ? route.system : route?.kind === "whitegum" ? "Whitegum" : "";
    row(recording, {
      linkSystem: system,
      value: cleanValue(route?.kind === "external" ? externalValue(route.system, url) : route?.kind === "whitegum" ? (whitegumValue(url) ?? url) : url),
      url,
      linkTitle: str(link, "title"),
      linkDescription: str(link, "description"),
      oldLinkId: linkId,
      // The old column is "isActive": the old schema gave it no @map.
      linkIsActive: link.isActive === undefined ? true : bool(link, "isActive"),
      linkIsPublic: link.is_public === undefined ? true : bool(link, "is_public"),
    });
    ctx.recordingLinkIds.add(linkId);
    ctx.tally.drop("links", linkId, CANDIDATE_RULE);
    candidateLinks += 1;
  }

  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, CANDIDATES_FILE), `${lines.join("\n")}\n`);
  ctx.line("Recording candidates (private file, outside git)", `${candidateLinks} old links written to ${CANDIDATES_FILE}`);
  ctx.line("Recording candidates (private file, outside git)", `${byRecording.size} old recordings, ${withoutLink} of them with no link of their own`);
  return candidateLinks;
}

/**
 * Event links and others (plan, "Other tables"). Items 119, 120: event contributors are in the
 * show archive (see step-shows.ts); the import makes no citation from them.
 */
export async function importLinks(ctx: Ctx): Promise<void> {
  const types = new Map((await ctx.read("link_types")).map((row) => [Number(row.id), str(row, "name")]));
  for (const row of await ctx.read("links")) importLink(ctx, row, types);
  for (const row of await ctx.read("rss_entries")) ctx.tally.drop("rss_entries", row.id, "replaced-by-the-public-list-of-changesets (item 20)");
  for (const row of await ctx.read("data_migrations")) ctx.tally.drop("data_migrations", row.id, "system-table");
}

function importLink(ctx: Ctx, row: Row, types: Map<number, string | null>): void {
  const id = Number(row.id);
  // A link to a recording is a candidate (item 118): the candidates step has counted it.
  if (ctx.recordingLinkIds.has(id)) return;
  const url = str(row, "url");
  const songId = num(row, "song_id");
  const target =
    ctx.showByEvent.get(num(row, "event_id") ?? -1) ??
    ctx.workBySong.get(songId ?? -1) ??
    ctx.placeByVenue.get(num(row, "venue_id") ?? -1)?.placeId;
  if (num(row, "event_id") !== null && ctx.testEvents.has(num(row, "event_id") as number)) {
    ctx.tally.drop("links", id, TEST_RULE);
    return;
  }
  if (songId !== null && ctx.unknownSongs.has(songId) && target === undefined) {
    ctx.tally.drop("links", id, "its song is unknown and has no work (item 121)");
    return;
  }
  if (!url || target === undefined) {
    ctx.tally.notMapped("links", id, !url ? "the link has no url" : "its record was not migrated");
    return;
  }
  if (row.is_public !== undefined && !bool(row, "is_public")) {
    ctx.tally.notMapped("links", id, "private link: an external ID has no public flag");
    return;
  }
  const route = routeLink(url, types.get(num(row, "link_type_id") ?? -1) ?? null);
  const isActive = row.isActive === undefined ? true : bool(row, "isActive");
  if (route.kind === "whitegum") {
    // Item 121: a reading link on the song's work, not a citation. The page name is the value.
    if (songId === null || ctx.workBySong.get(songId) !== target) {
      ctx.tally.notMapped("links", id, "a Whitegum link that is not on a song");
      return;
    }
    const page = whitegumValue(url);
    if (page === null) {
      // The template builds only /songfile/ pages: list the link, do not guess an address.
      ctx.tally.notMapped("links", id, "a Whitegum page outside /songfile/: no URL template fits it");
      ctx.line("Whitegum links outside /songfile/ (no address can be built; review)", `links:${id}`);
      return;
    }
    ctx.externalIds.push({ entityId: target, system: "Whitegum", value: page, legacyId: `links:${id}`, isActive, checkedAt: dateOf(row, "date_fetched") });
    ctx.tally.mapped("links", id);
  } else if (route.kind === "report") {
    ctx.tally.notMapped("links", id, route.reason);
  } else {
    ctx.externalIds.push({
      entityId: target,
      system: route.system,
      value: externalValue(route.system, url),
      legacyId: `links:${id}`,
      isActive,
      checkedAt: dateOf(row, "date_fetched"),
    });
    ctx.tally.mapped("links", id);
  }
  if (str(row, "title") || str(row, "description")) ctx.fieldDrop("links.title and links.description: not migrated (plan, Link)");
}

/** Write the collected external IDs. */
export async function flushEvidence(ctx: Ctx): Promise<void> {
  const seen = new Set<string>();
  const data: Array<{ entityId: number; linkSystemId: number; value: string; isActive: boolean; checkedAt: Date | null; legacyId: string }> = [];
  for (const e of ctx.externalIds) {
    const key = `${e.entityId}:${e.system}:${e.value}`;
    if (seen.has(key)) {
      ctx.fieldDrop("external IDs: duplicate of one already written (same record, system and value)");
      continue;
    }
    seen.add(key);
    data.push({
      entityId: e.entityId,
      linkSystemId: ctx.list.linkSystem.get(e.system) as number,
      value: e.value,
      isActive: e.isActive ?? true,
      checkedAt: e.checkedAt ?? null,
      legacyId: e.legacyId,
    });
  }
  await ctx.db.externalId.createMany({ data });
}

/** Notes, then the backlinks a save would write (item 52), then the addresses (item 45). */
export async function flushNotes(ctx: Ctx): Promise<void> {
  // Item 23: old internal song links become wikilinks (item 52) before the notes are written.
  let rewritten = 0;
  let unresolved = 0;
  const notes = ctx.notes.map((note) => {
    const out = rewriteSongLinks(note.body, ctx.songTitleBySlug);
    rewritten += out.changed;
    unresolved += out.unresolved;
    return out.changed > 0 ? { ...note, body: out.text } : note;
  });
  ctx.line("Internal song links rewritten as wikilinks", `${rewritten} link(s) rewritten, ${unresolved} left as written (unknown slug)`);
  for (let start = 0; start < notes.length; start += 1000) {
    const part = notes.slice(start, start + 1000);
    const made = await ctx.db.note.createManyAndReturn({
      data: part.map((n) => ({ body: n.body, isPublic: n.isPublic, legacyId: n.legacyId })),
      select: { id: true },
    });
    const ids = made.map((row) => row.id).sort((a, b) => a - b);
    await ctx.db.noteAttachment.createMany({ data: part.map((n, index) => ({ noteId: ids[index], entityId: n.entityId })) });
    const backlinks = part.flatMap((n, index) => findUrls(n.body).map((url) => ({ fromNoteId: ids[index], url })));
    if (backlinks.length > 0) await ctx.db.backlink.createMany({ data: backlinks });
  }
  const seen = new Set<string>();
  const data = ctx.addresses.filter((a) => {
    if (seen.has(a.path)) return false;
    seen.add(a.path);
    return true;
  });
  await ctx.db.address.createMany({ data: data.map((a) => ({ path: a.path, entityId: a.entityId })) });
}
