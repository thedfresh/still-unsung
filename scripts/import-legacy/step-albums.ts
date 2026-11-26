import { bulk, type Ctx } from "./context.ts";
import { bool, dateOf, fixDoubledTitle, isBookTitle, normalizeName, num, slugify, str } from "./rules.ts";

// Item 121: the old albums. Hunter's records are archive-owned: each becomes a source of kind
// album, with no Zotero link. The three old "albums" that are books wait for the book import
// (Zotero owns books). Each song on an album becomes a source-work link; the track number is the
// place and the position.

export async function importAlbums(ctx: Ctx): Promise<void> {
  const albums = await ctx.read("albums");
  const songAlbums = await ctx.read("song_albums");
  const kind = ctx.list.sourceKind.get("album") as number;
  const usedKeys = new Set<string>([...ctx.list.source.keys()].map((key) => slugify(key)));

  const music: Array<{ row: (typeof albums)[number]; title: string; key: string }> = [];
  const books = new Set<number>();
  for (const row of albums) {
    const id = Number(row.id);
    const title = str(row, "title") ?? `Album ${id}`;
    if (isBookTitle(title)) {
      books.add(id);
      ctx.tally.notMapped("albums", id, "a book: it waits for the book import (item 121)");
      ctx.line("Books waiting for the book import (not made as album sources)", `albums:${id}: "${title}"`);
      continue;
    }
    const fixed = fixDoubledTitle(title);
    if (fixed !== title) ctx.line("Album titles with a doubled title, fixed", `albums:${id}: "${title}" became "${fixed}"`);
    let key = slugify(fixed) || `album-${id}`;
    for (let n = 2; usedKeys.has(key); n += 1) key = `${slugify(fixed) || `album-${id}`}-${n}`;
    usedKeys.add(key);
    music.push({ row, title: fixed, key });
  }

  const ids = await bulk(
    ctx,
    "SOURCE",
    music,
    async (batch) => {
      await ctx.db.source.createMany({
        data: batch.map(({ item, id }) => ({
          id,
          key: item.key,
          title: item.title,
          sourceKindId: kind,
          // Archive-owned: no Zotero key, no Zotero cache (item 121).
          slug: str(item.row, "slug"),
        })),
      });
    },
    () => true,
    (item) => dateOf(item.row, "created_at"),
  );
  const sourceByAlbum = new Map<number, number>();
  music.forEach((item, index) => {
    const oldId = Number(item.row.id);
    const sourceId = ids[index];
    sourceByAlbum.set(oldId, sourceId);
    ctx.tally.mapped("albums", oldId);
    const artist = str(item.row, "artist");
    const year = num(item.row, "release_year");
    if (artist) ctx.note(sourceId, `Artist: ${artist}`, true, `albums:${oldId}:artist`);
    if (year !== null) ctx.note(sourceId, `Released: ${year}`, true, `albums:${oldId}:releaseYear`);
    if (item.row.is_official !== undefined && !bool(item.row, "is_official")) ctx.note(sourceId, "Not an official release.", true, `albums:${oldId}:isOfficial`);
    ctx.note(sourceId, str(item.row, "public_notes"), true, `albums:${oldId}:publicNotes`);
    ctx.note(sourceId, str(item.row, "private_notes"), false, `albums:${oldId}:privateNotes`);
    const slug = str(item.row, "slug");
    if (slug) ctx.addresses.push({ path: `/album/${slug}`, entityId: sourceId, slug });
  });
  ctx.line("Album sources made (archive-owned, no Zotero key)", `${music.length} albums`);

  const seen = new Set<string>();
  const links: Array<{ sourceId: number; workId: number; track: number | null; legacyId: string }> = [];
  const rockColumbia = new Set(music.filter((item) => /rock columbia/.test(normalizeName(item.title))).map((item) => Number(item.row.id)));
  let rockColumbiaTracks = 0;
  for (const row of songAlbums) {
    const id = Number(row.id);
    const albumId = num(row, "album_id") ?? -1;
    const songId = num(row, "song_id") ?? -1;
    const sourceId = sourceByAlbum.get(albumId);
    const workId = ctx.workBySong.get(songId);
    if (books.has(albumId)) ctx.tally.notMapped("song_albums", id, "its album is a book: it waits for the book import (item 121)");
    else if (ctx.unknownSongs.has(songId)) ctx.tally.drop("song_albums", id, "its song is unknown and has no work (item 121)");
    else if (sourceId === undefined || workId === undefined) ctx.tally.notMapped("song_albums", id, "its album or song was not migrated");
    else {
      const track = num(row, "track_number");
      const key = `${sourceId}:${workId}:${track ?? ""}`;
      if (seen.has(key)) {
        ctx.tally.drop("song_albums", id, "same-song-on-the-same-track-already-linked");
        continue;
      }
      seen.add(key);
      links.push({ sourceId, workId, track, legacyId: `song_albums:${id}` });
      ctx.tally.mapped("song_albums", id);
      if (rockColumbia.has(albumId) && track !== null) rockColumbiaTracks += 1;
    }
  }
  await bulk(ctx, "SOURCE_WORK", links, async (batch) => {
    await ctx.db.sourceWork.createMany({
      data: batch.map(({ item, id }) => ({
        id,
        sourceId: item.sourceId,
        workId: item.workId,
        place: item.track === null ? null : `Track ${item.track}`,
        position: item.track,
      })),
    });
  });
  ctx.line("Songs on albums (source-work links)", `${links.length} links; ${rockColumbiaTracks} with a track number on Rock Columbia`);
}
