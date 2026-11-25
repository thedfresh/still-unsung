import { bulk, uniqueKey, type Ctx } from "./context.ts";
import { SUITES, isDroppedTag, normalizeName, num, slugify, splitCredit, str, suiteForTag } from "./rules.ts";

// Step 3 (plan section 4: Song, Tag): works, then credits, default singers and suites.

type RoleName = "words" | "music" | "arrangement";

const CREDIT_FIELDS: Array<{ field: string; roles: RoleName[] }> = [
  { field: "lyrics_by", roles: ["words"] },
  { field: "music_by", roles: ["music"] },
  { field: "song_by", roles: ["words", "music"] },
  { field: "arrangement", roles: ["arrangement"] },
];

export async function importWorks(ctx: Ctx): Promise<void> {
  const songs = await ctx.read("songs");
  const songKind = ctx.list.workKind.get("song") as number;
  const usedSlugs = new Set<string>();
  const ids = await bulk(ctx, "WORK", songs, async (batch) => {
    await ctx.db.work.createMany({
      data: batch.map(({ item, id }) => {
        const slug = str(item, "slug");
        const keep = slug !== null && !usedSlugs.has(slug) ? slug : null;
        if (keep) usedSlugs.add(keep);
        const alternate = str(item, "alternate_title");
        return {
          id,
          title: str(item, "title") ?? `Song ${item.id}`,
          otherNames: alternate ? [alternate] : [],
          workKindId: songKind,
          slug: keep,
          legacyId: `songs:${item.id}`,
        };
      }),
    });
  });
  songs.forEach((row, index) => {
    const id = Number(row.id);
    const workId = ids[index];
    ctx.workBySong.set(id, workId);
    ctx.tally.mapped("songs", id);
    ctx.note(workId, str(row, "public_notes"), true, `songs:${id}:publicNotes`);
    ctx.note(workId, str(row, "private_notes"), false, `songs:${id}:privateNotes`);
    const slug = str(row, "slug");
    if (slug) ctx.addresses.push({ path: `/song/${slug}`, entityId: workId, slug });

    // Item 99: the original artist stays as a public note; the curator decides what it becomes.
    const artist = str(row, "original_artist");
    if (artist) {
      ctx.note(workId, `Best-known version: ${artist}`, true, `songs:${id}:originalArtist`);
      ctx.propose("12-best-known-versions", { workId, legacyId: `songs:${id}`, bestKnown: artist });
    }
    if (bool01(row, "is_uncertain")) {
      ctx.uncertainSongs.add(id);
      ctx.propose("02-uncertain-songs", { workId, legacyId: `songs:${id}`, title: str(row, "title") });
    }
    if (num(row, "parent_song_id") !== null) {
      const parent = ctx.workBySong.get(Number(row.parent_song_id));
      ctx.propose("05-variant-songs", { workId, legacyId: `songs:${id}`, parentLegacyId: `songs:${row.parent_song_id}`, parentWorkId: parent ?? null });
    }
    if (bool01(row, "is_instrumental")) {
      ctx.propose("11-instrumental-works", { workId, legacyId: `songs:${id}` });
    }
    if (bool01(row, "in_box_of_rain")) {
      ctx.line("Songs marked as in A Box of Rain", `work ${workId} (songs:${id}): for the lyric import`);
    }
  });
  // A parent song may come later in the id order: fill the missing parent ids.
  for (const entry of ctx.proposals.get("05-variant-songs") ?? []) {
    if (entry.parentWorkId === null) {
      const oldId = Number(String(entry.parentLegacyId).split(":")[1]);
      entry.parentWorkId = ctx.workBySong.get(oldId) ?? null;
    }
  }

  await importCredits(ctx, songs);
  await importSingers(ctx, songs);
  await importSuites(ctx);
}

function bool01(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true || row[key] === 1 || row[key] === "t";
}

/** A person for a name in credit text: an existing one with that name, or a new one. */
async function personForName(ctx: Ctx, name: string, legacyId: string): Promise<number> {
  const normalized = normalizeName(name);
  const found = ctx.personByName.get(normalized);
  if (found !== undefined) return found;
  const [entity] = await ctx.db.entity.createManyAndReturn({ data: [{ kind: "PERSON" }], select: { id: true } });
  await ctx.db.person.create({
    data: { id: entity.id, key: uniqueKey(ctx, slugify(name)), name, legacyId },
  });
  ctx.personByName.set(normalized, entity.id);
  ctx.line("People made from text", `person ${entity.id} from ${legacyId}`);
  return entity.id;
}

async function importCredits(ctx: Ctx, songs: Array<Record<string, unknown>>): Promise<void> {
  const pending: Array<{ workId: number; personId: number; roleId: number; legacyId: string; position: number }> = [];
  for (const row of songs) {
    const oldId = Number(row.id);
    const workId = ctx.workBySong.get(oldId) as number;
    for (const { field, roles } of CREDIT_FIELDS) {
      const text = str(row, field);
      if (!text) continue;
      const names = splitCredit(text);
      if (!names) {
        // Safe default: keep the text as a public note and list it for review (item 98).
        ctx.note(workId, `Credit (${field.replace("_", " ")}): ${text}`, true, `songs:${oldId}:${field}`);
        ctx.propose("08-credit-splits", { workId, legacyId: `songs:${oldId}`, field, text });
        continue;
      }
      let position = 0;
      for (const name of names) {
        const personId = await personForName(ctx, name, `songs:${oldId}:${camel(field)}`);
        for (const role of roles) {
          pending.push({
            workId,
            personId,
            roleId: ctx.list.creditRole.get(role) as number,
            legacyId: `songs:${oldId}:${camel(field)}`,
            position,
          });
        }
        position += 1;
      }
    }
  }
  await bulk(ctx, "CREDIT", pending, async (batch) => {
    await ctx.db.credit.createMany({
      data: batch.map(({ item, id }) => ({
        id,
        workId: item.workId,
        personId: item.personId,
        roleId: item.roleId,
        kind: "ATTRIBUTED" as const,
        certainty: "CONFIRMED" as const,
        position: item.position,
        legacyId: item.legacyId,
      })),
    });
  });
}

function camel(field: string): string {
  return field.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

async function importSingers(ctx: Ctx, songs: Array<Record<string, unknown>>): Promise<void> {
  const vocalists = await ctx.read("song_vocalists");
  const seen = new Set<string>();
  const wanted: Array<{ workId: number; personId: number | null; legacyId: string }> = [];
  const add = (songId: number | null, musicianId: number | null, legacyId: string): boolean => {
    const workId = songId === null ? undefined : ctx.workBySong.get(songId);
    if (workId === undefined) return false;
    const personId = musicianId === null ? null : (ctx.personByMusician.get(musicianId) ?? null);
    const key = `${workId}:${personId}`;
    if (!seen.has(key)) {
      seen.add(key);
      wanted.push({ workId, personId, legacyId });
    }
    return true;
  };
  for (const row of songs) {
    const lead = num(row, "lead_vocals_id");
    if (lead !== null) add(Number(row.id), lead, `songs:${row.id}:leadVocals`);
  }
  for (const row of vocalists) {
    const musicianId = num(row, "musician_id");
    const unknown = musicianId === null || ctx.personByMusician.get(musicianId) === null;
    if (add(num(row, "song_id"), unknown ? null : musicianId, `song_vocalists:${row.id}`)) ctx.tally.mapped("song_vocalists", row.id);
    else ctx.tally.notMapped("song_vocalists", row.id, "song was not migrated");
  }
  await bulk(ctx, "WORK_SINGER", wanted, async (batch) => {
    await ctx.db.workSinger.createMany({
      data: batch.map(({ item, id }) => ({ id, workId: item.workId, personId: item.personId, legacyId: item.legacyId })),
    });
  });
}

/** Item 35: suite tags become "part of" references to a suite work. */
async function importSuites(ctx: Ctx): Promise<void> {
  const tags = await ctx.read("tags");
  const songTags = await ctx.read("song_tags");
  const suiteWork = new Map<string, number>();
  const workKind = ctx.list.workKind.get("suite") as number;
  const partOf = ctx.list.referenceKind.get("part of") as number;
  const tagById = new Map(tags.map((row) => [Number(row.id), str(row, "name") ?? ""]));

  const needed = new Set<string>();
  for (const row of songTags) {
    const suite = suiteForTag(tagById.get(Number(row.tag_id)) ?? "");
    if (suite) needed.add(suite.match);
  }
  for (const suite of SUITES.filter((s) => needed.has(s.match))) {
    const [entity] = await ctx.db.entity.createManyAndReturn({ data: [{ kind: "WORK" }], select: { id: true } });
    await ctx.db.work.create({
      data: { id: entity.id, title: suite.title, workKindId: workKind, suiteStructure: suite.structure, legacyId: `tags:${suite.match}` },
    });
    suiteWork.set(suite.match, entity.id);
    ctx.line("Suites made by the script", `work ${entity.id} (${suite.structure})`);
    if (suite.structure === "FIXED") ctx.propose("09-suite-parts", { workId: entity.id, suite: suite.title });
  }

  const links: Array<{ fromWork: number; toWork: number; legacyId: string }> = [];
  for (const row of songTags) {
    const tagName = tagById.get(Number(row.tag_id)) ?? "";
    const suite = suiteForTag(tagName);
    const fromWork = ctx.workBySong.get(Number(row.song_id));
    if (suite && fromWork !== undefined) {
      links.push({ fromWork, toWork: suiteWork.get(suite.match) as number, legacyId: `song_tags:${row.id}` });
      ctx.tally.mapped("song_tags", row.id);
    } else if (isDroppedTag(tagName)) {
      ctx.tally.drop("song_tags", row.id, "dylan-and-beatles-tags-are-derived-from-credits (item 35)");
    } else {
      ctx.tally.notMapped("song_tags", row.id, "tag is not a suite tag and has no rule");
    }
  }
  await bulk(ctx, "REFERENCE", links, async (batch) => {
    await ctx.db.reference.createMany({
      data: batch.map(({ item, id }) => ({
        id,
        fromId: item.fromWork,
        toId: item.toWork,
        referenceKindId: partOf,
        saidById: ctx.fixedPerson.curator,
        legacyId: item.legacyId,
      })),
    });
  });

  const used = new Set(songTags.map((row) => Number(row.tag_id)));
  for (const row of tags) {
    const name = str(row, "name") ?? "";
    if (suiteForTag(name)) ctx.tally.mapped("tags", row.id);
    else if (isDroppedTag(name)) ctx.tally.drop("tags", row.id, "dylan-and-beatles-tags-are-derived-from-credits (item 35)");
    else if (!used.has(Number(row.id))) ctx.tally.drop("tags", row.id, "unused-tag-dropped (item 35)");
    else ctx.tally.notMapped("tags", row.id, "used tag with no rule");
  }
}
