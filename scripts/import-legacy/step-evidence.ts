import { bulk, uniqueKey, type Ctx } from "./context.ts";
import { bool, dateOf, externalValue, findUrls, normalizeName, num, routeLink, slugify, str, type Row } from "./rules.ts";

// Steps 5 to 8: recordings, links and outside IDs, citations, notes, backlinks and addresses.

const TEST_RULE = "test-show-2099-12-20";

export async function importRecordings(ctx: Ctx): Promise<void> {
  const rows = await ctx.read("recordings");
  const kept = rows.filter((row) => {
    const eventId = Number(row.event_id);
    if (ctx.testEvents.has(eventId)) ctx.tally.drop("recordings", row.id, TEST_RULE);
    else if (!ctx.showByEvent.has(eventId)) ctx.tally.notMapped("recordings", row.id, "its event was not migrated");
    else return true;
    return false;
  });

  // A person for each distinct taper name (plan, Recording). Listed in the report.
  const taperByName = new Map<string, number>();
  for (const row of kept) {
    const name = str(row, "taper");
    if (!name || taperByName.has(normalizeName(name))) continue;
    const [entity] = await ctx.db.entity.createManyAndReturn({ data: [{ kind: "PERSON" }], select: { id: true } });
    await ctx.db.person.create({
      data: { id: entity.id, key: uniqueKey(ctx, slugify(name)), name, legacyId: `recordings:${row.id}:taper` },
    });
    taperByName.set(normalizeName(name), entity.id);
    ctx.line("People made from text", `person ${entity.id} from recordings:${row.id}:taper`);
  }

  const oldRecordingTypeName = new Map<number, string>();
  for (const type of await ctx.read("recording_types")) {
    const name = str(type, "name");
    if (name && normalizeName(name) !== "unknown") oldRecordingTypeName.set(Number(type.id), name);
  }
  const ids = await bulk(
    ctx,
    "RECORDING",
    kept,
    async (batch) => {
      await ctx.db.recording.createMany({
        data: batch.map(({ item, id }) => {
          const typeName = oldRecordingTypeName.get(num(item, "recording_type_id") ?? -1);
          const taper = str(item, "taper");
          return {
            id,
            showId: ctx.showByEvent.get(Number(item.event_id)) as number,
            recordingTypeId: typeName ? (ctx.list.recordingType.get(normalizeName(typeName)) ?? null) : null,
            description: str(item, "description"),
            taperId: taper ? (taperByName.get(normalizeName(taper)) ?? null) : null,
            lengthMinutes: num(item, "length_minutes"),
            featured: bool(item, "featured"),
            featuredText: str(item, "featured_text"),
            legacyId: `recordings:${item.id}`,
          };
        }),
      });
    },
    (row) => ctx.eventPublic.get(Number(row.event_id)) ?? true,
  );
  kept.forEach((row, index) => {
    const oldId = Number(row.id);
    const recordingId = ids[index];
    ctx.recordingByRecording.set(oldId, recordingId);
    ctx.tally.mapped("recordings", oldId);
    ctx.note(recordingId, str(row, "public_notes"), true, `recordings:${oldId}:publicNotes`);
    ctx.note(recordingId, str(row, "private_notes"), false, `recordings:${oldId}:privateNotes`);
    for (const [field, system, camel] of [
      ["shn_id", "SHN", "shnId"],
      ["lma_identifier", "Live Music Archive", "lmaIdentifier"],
      ["lossless_legs_id", "Lossless Legs", "losslessLegsId"],
      ["youtube_video_id", "YouTube", "youtubeVideoId"],
    ] as const) {
      const value = str(row, field);
      if (value) ctx.externalIds.push({ entityId: recordingId, system, value, legacyId: `recordings:${oldId}:${camel}` });
    }
    const contributor = ctx.personByContributor.get(num(row, "contributor_id") ?? -1);
    if (contributor !== undefined) ctx.citations.push({ entityId: recordingId, contributorId: contributor, legacyId: `recordings:${oldId}:contributor` });
    if (str(row, "url")) ctx.line("Recording URLs not migrated", `recordings:${oldId}: the plan drops the old url field`);
  });
}

/** Event contributors and links (plan, "Other tables"). */
export async function importContributorsAndLinks(ctx: Ctx): Promise<void> {
  const seen = new Set(ctx.citations.filter((c) => c.contributorId !== undefined && !c.sourceId && !c.recordingId).map((c) => `${c.entityId}:${c.contributorId}:`));
  for (const row of await ctx.read("event_contributors")) {
    const eventId = Number(row.event_id);
    const showId = ctx.showByEvent.get(eventId);
    const contributor = ctx.personByContributor.get(num(row, "contributor_id") ?? -1);
    if (ctx.testEvents.has(eventId)) ctx.tally.drop("event_contributors", row.id, TEST_RULE);
    else if (showId === undefined || contributor === undefined) ctx.tally.notMapped("event_contributors", row.id, "its show or contributor was not migrated");
    else {
      const note = str(row, "description");
      const key = `${showId}:${contributor}:${note ?? ""}`;
      if (seen.has(key)) {
        ctx.tally.drop("event_contributors", row.id, "same-citation-already-made-from-a-contributor-line");
        continue;
      }
      seen.add(key);
      ctx.citations.push({ entityId: showId, contributorId: contributor, note, legacyId: `event_contributors:${row.id}` });
      ctx.tally.mapped("event_contributors", row.id);
      ctx.note(showId, str(row, "public_notes"), true, `event_contributors:${row.id}:publicNotes`);
      ctx.note(showId, str(row, "private_notes"), false, `event_contributors:${row.id}:privateNotes`);
    }
  }

  const types = new Map((await ctx.read("link_types")).map((row) => [Number(row.id), str(row, "name")]));
  for (const row of await ctx.read("links")) importLink(ctx, row, types);

  // Albums are listed, not made: each becomes a Zotero item first (item 34).
  for (const row of await ctx.read("albums")) ctx.tally.notMapped("albums", row.id, "each album becomes a Zotero item first (item 34)");
  for (const row of await ctx.read("song_albums")) ctx.tally.notMapped("song_albums", row.id, "waits for the album sources (item 34)");
  for (const row of await ctx.read("rss_entries")) ctx.tally.drop("rss_entries", row.id, "replaced-by-the-public-list-of-changesets (item 20)");
  for (const row of await ctx.read("data_migrations")) ctx.tally.drop("data_migrations", row.id, "system-table");
}

function importLink(ctx: Ctx, row: Row, types: Map<number, string | null>): void {
  const id = Number(row.id);
  const url = str(row, "url");
  const target =
    ctx.showByEvent.get(num(row, "event_id") ?? -1) ??
    ctx.workBySong.get(num(row, "song_id") ?? -1) ??
    ctx.placeByVenue.get(num(row, "venue_id") ?? -1)?.placeId ??
    ctx.recordingByRecording.get(num(row, "recording_id") ?? -1);
  if (num(row, "event_id") !== null && ctx.testEvents.has(num(row, "event_id") as number)) {
    ctx.tally.drop("links", id, TEST_RULE);
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
  if (route.kind === "whitegum") {
    ctx.citations.push({ entityId: target, sourceId: ctx.list.source.get("whitegum") as number, place: url, legacyId: `links:${id}` });
    ctx.tally.mapped("links", id);
  } else if (route.kind === "report") {
    ctx.tally.notMapped("links", id, route.reason);
  } else {
    ctx.externalIds.push({
      entityId: target,
      system: route.system,
      value: externalValue(route.system, url),
      legacyId: `links:${id}`,
      isActive: row.is_active === undefined ? true : bool(row, "is_active"),
      checkedAt: dateOf(row, "date_fetched"),
    });
    ctx.tally.mapped("links", id);
  }
  if (str(row, "title") || str(row, "description")) ctx.fieldDrop("links.title and links.description: not migrated (plan, Link)");
}

/** Write the collected citations and external IDs. */
export async function flushEvidence(ctx: Ctx): Promise<void> {
  await ctx.db.citation.createMany({
    data: ctx.citations.map((c) => ({
      entityId: c.entityId,
      sourceId: c.sourceId ?? null,
      recordingId: c.recordingId ?? null,
      contributorId: c.contributorId ?? null,
      place: c.place ?? null,
      excerpt: c.excerpt ?? null,
      note: c.note ?? null,
      legacyId: c.legacyId,
    })),
  });
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
  const notes = ctx.notes;
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
