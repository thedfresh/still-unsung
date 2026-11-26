import { bulk, uniqueKey, type Ctx } from "./context.ts";
import {
  SUITES,
  dateOf,
  isDroppedTag,
  isReviewCredit,
  isUnknownSong,
  normalizeName,
  num,
  parseTraditional,
  slugify,
  splitCredit,
  str,
  suiteForTag,
  surnameOf,
  vocalRoleOf,
  type TraditionalCredit,
} from "./rules.ts";

// Step 3 (plan section 4: Song, Tag): works, then credits, default singers and suites.

type RoleName = "words" | "music" | "arrangement";

// The old `arrangement` field holds version labels ("Lloyd Price version"), not credits (item 121).
const CREDIT_FIELDS: Array<{ field: string; roles: RoleName[] }> = [
  { field: "lyrics_by", roles: ["words"] },
  { field: "music_by", roles: ["music"] },
  { field: "song_by", roles: ["words", "music"] },
];

export async function importWorks(ctx: Ctx): Promise<void> {
  const allSongs = await ctx.read("songs");
  // Item 121: "Unknown Song" and "Unknown Instrumental" get no work and no placeholder work. Their
  // performances become segments with no work.
  const songs = allSongs.filter((row) => {
    const title = str(row, "title") ?? "";
    if (!isUnknownSong(title)) return true;
    ctx.unknownSongs.set(Number(row.id), title);
    ctx.tally.drop("songs", row.id, "unknown-song-or-instrumental: no work, no placeholder (item 121)");
    return false;
  });
  const songKind = ctx.list.workKind.get("song") as number;
  const usedSlugs = new Set<string>();
  const traditional = traditionalSongs(songs);
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
          traditional: traditional.has(Number(item.id)),
          slug: keep,
          legacyId: `songs:${item.id}`,
        };
      }),
    });
  }, () => true, (row) => dateOf(row, "created_at"));
  songs.forEach((row, index) => {
    const id = Number(row.id);
    const workId = ids[index];
    ctx.workBySong.set(id, workId);
    ctx.tally.mapped("songs", id);
    ctx.note(workId, str(row, "public_notes"), true, `songs:${id}:publicNotes`);
    ctx.note(workId, str(row, "private_notes"), false, `songs:${id}:privateNotes`);
    const slug = str(row, "slug");
    if (slug) {
      ctx.addresses.push({ path: `/song/${slug}`, entityId: workId, slug });
      ctx.songTitleBySlug.set(slug, str(row, "title") ?? `Song ${id}`);
    }

    // Item 99: the original artist stays as a public note; the curator decides what it becomes.
    const artist = str(row, "original_artist");
    if (artist) {
      ctx.note(workId, `Best-known version: ${artist}`, true, `songs:${id}:originalArtist`);
      ctx.propose("12-best-known-versions", { workId, legacyId: `songs:${id}`, bestKnown: artist });
    }
    // Item 121 (12): the old arrangement text is a version label, never a credit or a person.
    const label = str(row, "arrangement");
    if (label) {
      ctx.line("Version labels from songs.arrangement (no credit, no person)", `songs:${id} (work ${workId}): "${label}"`);
      ctx.fieldDrop("songs.arrangement: listed as a version label, no credit made (item 121)");
    }
    if (bool01(row, "is_uncertain")) {
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
      ctx.line("Songs marked as in A Box of Rain (wait for the book import)", `work ${workId} (songs:${id})`);
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
  await importSingers(ctx);
  await importSuites(ctx, songs);
}

function bool01(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true || row[key] === 1 || row[key] === "t";
}

/** The old songs whose credit text says "Traditional" (item 121). They get the marker. */
function traditionalSongs(songs: Array<Record<string, unknown>>): Set<number> {
  const out = new Set<number>();
  for (const row of songs) {
    for (const { field } of CREDIT_FIELDS) {
      const text = str(row, field);
      if (text && parseTraditional(text)) out.add(Number(row.id));
    }
  }
  return out;
}

/** The name forms (normalized) that always mean the seeded Robert Hunter in a credit. */
const HUNTER_FORMS = new Set(["robert hunter", "hunter", "bob hunter", "robert c hunter", "robert c. hunter"]);

/** A person for a name in credit text: an existing one with that name, or a new one. */
async function personForName(ctx: Ctx, name: string, legacyId: string): Promise<number> {
  const normalized = normalizeName(name);
  // Robert Hunter's usual name forms are the seeded person, never a new one.
  if (HUNTER_FORMS.has(normalized)) return ctx.fixedPerson.hunter;
  const found = ctx.personByName.get(normalized);
  if (found !== undefined) return found;
  const [entity] = await ctx.db.entity.createManyAndReturn({ data: [{ kind: "PERSON" }], select: { id: true } });
  await ctx.db.person.create({
    data: { id: entity.id, key: uniqueKey(ctx, slugify(name)), name, legacyId },
  });
  ctx.personByName.set(normalized, entity.id);
  ctx.line("People made from text", `person ${entity.id} from ${legacyId}`);
  // Another name with "Hunter" in it may still be him: propose it, never merge it.
  if (normalized.split(" ").includes("hunter")) {
    ctx.propose("06-person-merges", { personIds: `${ctx.fixedPerson.hunter},${entity.id}`, legacyIds: `robert-hunter,${legacyId}`, name, reason: "near-match of Robert Hunter" });
  }
  return entity.id;
}

/** One name in a credit, with the roles it gets. */
interface CreditName {
  workId: number;
  name: string;
  roles: RoleName[];
  legacyId: string;
  position: number;
}

const isSurnameOnly = (name: string): boolean => {
  const normalized = normalizeName(name);
  return !normalized.includes(" ") && !HUNTER_FORMS.has(normalized);
};

async function importCredits(ctx: Ctx, songs: Array<Record<string, unknown>>): Promise<void> {
  const names: CreditName[] = [];
  for (const row of songs) {
    const oldId = Number(row.id);
    const workId = ctx.workBySong.get(oldId) as number;
    for (const { field, roles } of CREDIT_FIELDS) {
      const text = str(row, field);
      if (!text) continue;
      const legacyId = `songs:${oldId}:${camel(field)}`;
      // Item 121: odd credits go on the review list, with no credit.
      if (isReviewCredit(text)) {
        ctx.line("Credit text left for review (no credit made)", `songs:${oldId} ${field}: "${text}"`);
        ctx.propose("08-credit-splits", { workId, legacyId: `songs:${oldId}`, field, text, reason: "left for review (item 121)" });
        continue;
      }
      const trad: TraditionalCredit | null = parseTraditional(text);
      const parts: Array<{ name: string; roles: RoleName[] }> | null = trad
        ? [
            ...trad.authors.map((name) => ({ name, roles })),
            ...trad.arrangers.map((name) => ({ name, roles: ["arrangement"] as RoleName[] })),
          ]
        : (splitCredit(text) ?? []).map((name) => ({ name, roles }));
      if (!trad && parts.length === 0) {
        // Safe default: keep the text as a public note and list it for review (item 98).
        ctx.note(workId, `Credit (${field.replace("_", " ")}): ${text}`, true, legacyId);
        ctx.propose("08-credit-splits", { workId, legacyId: `songs:${oldId}`, field, text });
        continue;
      }
      if (trad && parts.length > 0) ctx.line("Traditional songs with a credit besides the marker", `songs:${oldId} ${field}: "${text}"`);
      parts.forEach((part, position) => names.push({ workId, name: part.name, roles: part.roles, legacyId, position }));
    }
  }

  // Item 20: first the full names, so a surname-only name finds its person whatever the song order.
  const personFor = new Map<CreditName, number>();
  for (const entry of names.filter((n) => !isSurnameOnly(n.name))) personFor.set(entry, await personForName(ctx, entry.name, entry.legacyId));
  const bySurname = new Map<string, Set<number>>();
  for (const [name, personId] of ctx.personByName) {
    const surname = surnameOf(name);
    if (surname) bySurname.set(surname, (bySurname.get(surname) ?? new Set<number>()).add(personId));
  }
  for (const entry of names.filter((n) => isSurnameOnly(n.name))) {
    const matches = [...(bySurname.get(normalizeName(entry.name)) ?? [])];
    if (matches.length === 1) {
      personFor.set(entry, matches[0]);
      ctx.line("Surname-only credit names resolved to a full-name person", `${entry.legacyId}: "${entry.name}" is person ${matches[0]}`);
    } else {
      ctx.line(
        "Surname-only credit names not resolved (kept as written; review)",
        `${entry.legacyId}: "${entry.name}" ${matches.length === 0 ? "matches no full-name person" : `matches ${matches.length} people`}`,
      );
      personFor.set(entry, await personForName(ctx, entry.name, entry.legacyId));
    }
  }

  const pending: Array<{ workId: number; personId: number; roleId: number; legacyId: string; position: number }> = [];
  for (const entry of names) {
    for (const role of entry.roles) {
      pending.push({
        workId: entry.workId,
        personId: personFor.get(entry) as number,
        roleId: ctx.list.creditRole.get(role) as number,
        legacyId: entry.legacyId,
        position: entry.position,
      });
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

/**
 * Default singers (items 33, 121): no band scope, leads only. A singer the old data does not know
 * ("Unknown") is dropped: a default of "not known" says nothing.
 */
async function importSingers(ctx: Ctx): Promise<void> {
  const songs = (await ctx.read("songs")).filter((row) => ctx.workBySong.has(Number(row.id)));
  const vocalists = await ctx.read("song_vocalists");
  const seen = new Set<string>();
  const wanted: Array<{ workId: number; personId: number; legacyId: string }> = [];
  /** "added", "unknown" (no person) or "no-song". */
  const add = (songId: number | null, musicianId: number | null, legacyId: string): "added" | "unknown" | "no-song" => {
    const workId = songId === null ? undefined : ctx.workBySong.get(songId);
    if (workId === undefined) return "no-song";
    const personId = musicianId === null ? null : ctx.personByMusician.get(musicianId);
    if (personId === null || personId === undefined) return "unknown";
    const key = `${workId}:${personId}`;
    if (!seen.has(key)) {
      seen.add(key);
      wanted.push({ workId, personId, legacyId });
    }
    return "added";
  };
  for (const row of songs) {
    const lead = num(row, "lead_vocals_id");
    if (lead !== null && add(Number(row.id), lead, `songs:${row.id}:leadVocals`) === "unknown") {
      ctx.fieldDrop("songs.lead_vocals_id: unknown default singer dropped (item 121)");
    }
  }
  for (const row of vocalists) {
    // Item 33: only lead singers become default singers. Other rows are listed, not guessed.
    const role = vocalRoleOf(str(row, "vocal_role"));
    if (role !== "LEAD") {
      const reason = role === "UNKNOWN" ? "the vocal role text names no single role" : "not a lead singer: only leads become default singers (item 33)";
      ctx.tally.notMapped("song_vocalists", row.id, reason);
      ctx.line(role === "UNKNOWN" ? "Unknown vocal role text" : "Song vocalists that are not leads", `song_vocalists:${row.id}: "${str(row, "vocal_role") ?? ""}"`);
      continue;
    }
    const outcome = add(num(row, "song_id"), num(row, "musician_id"), `song_vocalists:${row.id}`);
    if (outcome === "added") ctx.tally.mapped("song_vocalists", row.id);
    else if (outcome === "unknown") ctx.tally.drop("song_vocalists", row.id, "unknown-default-singer-dropped (item 121)");
    else if (ctx.unknownSongs.has(num(row, "song_id") ?? -1)) ctx.tally.drop("song_vocalists", row.id, "its song is unknown and has no work (item 121)");
    else ctx.tally.notMapped("song_vocalists", row.id, "song was not migrated");
  }
  await bulk(ctx, "WORK_SINGER", wanted, async (batch) => {
    await ctx.db.workSinger.createMany({
      data: batch.map(({ item, id }) => ({ id, workId: item.workId, personId: item.personId, legacyId: item.legacyId })),
    });
  });
}

/** Items 35, 121: suite tags become "part of" references to a suite work. */
async function importSuites(ctx: Ctx, songs: Array<Record<string, unknown>>): Promise<void> {
  const tags = await ctx.read("tags");
  const songTags = await ctx.read("song_tags");
  const suiteWork = new Map<string, number>();
  const workKind = ctx.list.workKind.get("suite") as number;
  const partOf = ctx.list.referenceKind.get("part of") as number;
  const tagById = new Map(tags.map((row) => [Number(row.id), str(row, "name") ?? ""]));
  const titleBySong = new Map(songs.map((row) => [Number(row.id), str(row, "title") ?? `Song ${row.id}`]));

  // The first old tag that names a suite is the legacy id of the suite work.
  const needed = new Map<string, number>();
  for (const row of songTags) {
    const suite = suiteForTag(tagById.get(Number(row.tag_id)) ?? "");
    if (suite && !needed.has(suite.match)) needed.set(suite.match, Number(row.tag_id));
  }
  for (const suite of SUITES.filter((s) => needed.has(s.match))) {
    const [entity] = await ctx.db.entity.createManyAndReturn({ data: [{ kind: "WORK" }], select: { id: true } });
    await ctx.db.work.create({
      data: { id: entity.id, title: suite.title, workKindId: workKind, suiteStructure: suite.structure, legacyId: `tags:${needed.get(suite.match)}` },
    });
    suiteWork.set(suite.match, entity.id);
    ctx.line("Suites made by the script", `work ${entity.id} (${suite.structure})`);
  }

  const links: Array<{ fromWork: number; toWork: number; legacyId: string }> = [];
  const partsOf = new Map<string, Array<{ workId: number; title: string }>>();
  for (const row of songTags) {
    const tagName = tagById.get(Number(row.tag_id)) ?? "";
    const suite = suiteForTag(tagName);
    const fromWork = ctx.workBySong.get(Number(row.song_id));
    if (suite && fromWork !== undefined) {
      links.push({ fromWork, toWork: suiteWork.get(suite.match) as number, legacyId: `song_tags:${row.id}` });
      partsOf.set(suite.match, [...(partsOf.get(suite.match) ?? []), { workId: fromWork, title: titleBySong.get(Number(row.song_id)) ?? "" }]);
      ctx.tally.mapped("song_tags", row.id);
    } else if (suite && ctx.unknownSongs.has(Number(row.song_id))) {
      ctx.tally.drop("song_tags", row.id, "its song is unknown and has no work (item 121)");
    } else if (isDroppedTag(tagName)) {
      ctx.tally.drop("song_tags", row.id, "dylan-and-beatles-tags-are-derived-from-credits (item 35)");
    } else {
      ctx.tally.notMapped("song_tags", row.id, "tag is not a suite tag and has no rule");
    }
  }
  // Part positions: no order is known yet. A fixed suite, or a concept album, needs its parts in
  // order, so the user gets the list (item 121).
  for (const suite of SUITES) {
    const workId = suiteWork.get(suite.match);
    if (workId === undefined || !(suite.structure === "FIXED" || suite.album)) continue;
    const parts = partsOf.get(suite.match) ?? [];
    ctx.propose("09-suite-parts", {
      workId,
      suite: suite.title,
      parts: parts.map((part) => part.title).join(" | "),
      partWorkIds: parts.map((part) => part.workId).join(","),
    });
    ctx.line("Suite parts with no known order", `${suite.title} (work ${workId}): ${parts.length} part(s)`);
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
