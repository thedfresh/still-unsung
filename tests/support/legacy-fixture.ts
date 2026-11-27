import type { Client } from "pg";

// A tiny, invented copy of the old database, in its own schema of the test database. The
// import test reads it as if it were the restored old copy. Every name and value is synthetic.
// Column names are the real ones of the old schema: snake_case through `@map`, except the few
// columns the old schema left unmapped, which are camelCase ("isActive" in `links`). Only the
// columns the import reads are created (it reads a missing column as empty). Every table also
// has `created_at`, which the import carries over.

export const LEGACY_SCHEMA = "legacy_fixture";

const TABLES: Record<string, string> = {
  instruments: "id int primary key, name text, display_name text",
  event_types: "id int primary key, name text, include_in_stats boolean",
  content_types: "id int primary key, name text",
  set_types: "id int primary key, name text, display_name text, include_in_stats boolean",
  recording_types: "id int primary key, name text, description text",
  link_types: "id int primary key, name text",
  bands: "id int primary key, name text, display_name text, is_hunter_band boolean, slug text, public_notes text, private_notes text",
  musicians: "id int primary key, name text, first_name text, last_name text, slug text, public_notes text, private_notes text, default_instrument_id int",
  contributors: "id int primary key, name text, email text, slug text, public_notes text, private_notes text",
  band_musicians: "id int primary key, band_id int, musician_id int, joined_date timestamp, left_date timestamp, public_notes text, private_notes text",
  band_musician_instruments: "id int primary key, band_musician_id int, instrument_id int",
  musician_default_instruments: "id int primary key, musician_id int, instrument_id int",
  venues: "id int primary key, name text, city text, state_province text, country text, context text, slug text, public_notes text, private_notes text",
  songs: "id int primary key, title text, alternate_title text, lyrics_by text, music_by text, song_by text, arrangement text, original_artist text, parent_song_id int, lead_vocals_id int, is_uncertain boolean, in_box_of_rain boolean, is_instrumental boolean, slug text, public_notes text, private_notes text",
  song_vocalists: "id int primary key, song_id int, musician_id int, vocal_role text",
  tags: "id int primary key, name text",
  song_tags: "id int primary key, song_id int, tag_id int",
  events: "id int primary key, year int, month int, day int, display_date text, date_uncertain boolean, venue_id int, venue_uncertain boolean, event_type_id int, content_type_id int, primary_band_id int, hunter_participation_uncertain boolean, billing text, public_notes text, verified boolean, is_uncertain boolean, show_timing text, raw_data text, private_notes text, is_public boolean, raw_data_gdsets text, etree_show_id text, slug text",
  event_musicians: "id int primary key, event_id int, musician_id int, instrument_id int, includes_vocals boolean, public_notes text, private_notes text",
  event_musician_instruments: "id int primary key, event_musician_id int, instrument_id int",
  event_contributors: "id int primary key, event_id int, contributor_id int, description text, public_notes text, private_notes text",
  sets: "id int primary key, event_id int, set_type_id int, position int, public_notes text, is_uncertain boolean, private_notes text, band_id int",
  set_musicians: "id int primary key, set_id int, musician_id int, instrument_id int, includes_vocals boolean, public_notes text, private_notes text",
  set_musician_instruments: "id int primary key, set_musician_id int, instrument_id int",
  performances: "id int primary key, set_id int, song_id int, performance_order int, segues_into boolean, is_truncated_start boolean, is_truncated_end boolean, has_cuts boolean, is_partial boolean, public_notes text, public_notes_expanded text, is_uncertain boolean, lead_vocals_id int, is_lyrical_fragment boolean, is_medley boolean, is_musical_fragment boolean, is_solo_hunter boolean, private_notes text, is_aborted boolean, lyrical_variation text, is_instrumental boolean",
  performance_musicians: "id int primary key, performance_id int, musician_id int, instrument_id int, includes_vocals boolean, public_notes text, private_notes text",
  performance_musician_instruments: "id int primary key, performance_musician_id int, instrument_id int",
  performance_vocalists: "id int primary key, performance_id int, musician_id int, vocal_role text",
  show_banter: "id int primary key, performance_id int, banter_text text, is_before_song boolean, is_verbatim boolean, public_notes text, private_notes text",
  recordings: "id int primary key, event_id int, recording_type_id int, description text, url text, shn_id text, taper text, contributor_id int, length_minutes int, public_notes text, private_notes text, lma_identifier text, lossless_legs_id text, youtube_video_id text, featured boolean, featured_text text",
  links: 'id int primary key, url text, title text, description text, "isActive" boolean, date_fetched timestamp, is_public boolean, event_id int, song_id int, venue_id int, recording_id int, link_type_id int',
  albums: "id int primary key, title text, artist text, release_year int, is_official boolean, slug text, public_notes text, private_notes text",
  song_albums: "id int primary key, song_id int, album_id int, track_number int",
  rss_entries: "id int primary key, title text",
  data_migrations: "id int primary key, filename text",
};

// One INSERT per table: [table, columns, rows]. `null` is SQL NULL.
const T = true;
const F = false;
type Value = string | number | boolean | null;
const DATA: Array<[string, string[], Value[][]]> = [
  ["instruments", ["id", "name", "display_name"], [[1, "guitar", "guitar"], [2, "bass", "bass"], [3, "vocals", "vocals"]]],
  ["event_types", ["id", "name", "include_in_stats"], [[1, "Public Performance", T], [2, "Errata", F], [3, "Studio Session", F]]],
  ["content_types", ["id", "name"], [[1, "Concert"], [2, "Interview"], [3, "Poetry Reading"]]],
  ["set_types", ["id", "name", "display_name", "include_in_stats"], [[1, "Complete Set", "Set", T], [2, "Partial Set", "Partial", T], [3, "Encore 1", "Encore", T], [4, "Soundcheck", "Soundcheck", F], [5, "Weird Type", "Weird", F]]],
  ["recording_types", ["id", "name", "description"], [[1, "SBD", "Soundboard recording"], [2, "Unknown", null]]],
  ["link_types", ["id", "name"], [[1, "Wikipedia"], [2, "Blog"], [3, "YouTube"], [4, "Live Music Archive"]]],
  ["bands", ["id", "name", "display_name", "is_hunter_band", "slug", "private_notes"], [[1, "Test Band", "The Test Band", T, "test-band", "Private band remark"]]],
  ["musicians", ["id", "name", "slug", "default_instrument_id"], [[1, "Robert Hunter", "robert-hunter-old", null], [2, "Test Guitarist", "test-guitarist", 1], [3, "Unknown", null, null], [4, "Test Bassist", "test-bassist", null], [5, "Jerry Garcia", "jerry-garcia", null]]],
  ["contributors", ["id", "name", "email", "slug"], [[1, "Test Contributor", "contrib@example.test", "test-contributor"], [2, "Test Guitarist", null, "test-guitarist"]]],
  ["band_musicians", ["id", "band_id", "musician_id", "joined_date", "left_date"], [[1, 1, 2, "1990-01-01", null], [2, 1, 4, "1990-01-01", "1995-12-31"]]],
  ["band_musician_instruments", ["id", "band_musician_id", "instrument_id"], [[1, 1, 1], [2, 2, 2]]],
  ["musician_default_instruments", ["id", "musician_id", "instrument_id"], [[1, 4, 2]]],
  ["venues", ["id", "name", "city", "state_province", "country", "context", "slug"], [[1, "Test Hall", "Testville", "TS", "Testland", null, "test-hall"], [2, "Other Hall", "Testville", "TS", "Testland", "Test Campus", "other-hall"], [3, "Fest Field", "Testville", "TS", "Testland", "Summer Test Festival", "fest-field"], [4, "Test Town", null, null, null, "Songwriters Hall of Fame", "test-town"], [5, "Unknown Venue", "Testville", "TS", "Testland", null, "unknown-venue"], [6, "US Hall", "Springfield", "CA", null, null, "us-hall"], [7, "Leus Park", "Testville", "TS", "Testland", "Fete des Leus", "leus-park"], [8, "Unknown Studio", "Testville", "TS", "Testland", null, "unknown-studio"]]],
  ["songs", ["id", "title", "alternate_title", "lyrics_by", "music_by", "song_by", "arrangement", "original_artist", "parent_song_id", "lead_vocals_id", "is_uncertain", "in_box_of_rain", "is_instrumental", "slug", "public_notes"], [
    [1, "Alpha Song", null, "Test Author / Second Author", "Test Author", null, null, "Test Group", null, 4, F, F, F, "alpha-song", "See https://example.test/page for more."],
    [2, "Beta Song", "Beta Alt", "Traditional", null, null, null, null, 1, null, T, F, F, "beta-song", null],
    [3, "Gamma Instrumental", null, null, "Hunter Smith", null, null, null, null, null, F, T, T, "gamma", null],
    [4, "Terrapin Part", null, "Hunter", null, null, null, null, null, null, F, F, F, "terrapin-part", "See [Alpha](/song/alpha-song) and [Missing](/song/nope)."],
    [5, "Peggy Test", null, null, null, "Traditional", null, null, null, null, F, F, F, "peggy-test", null],
    [6, "Arranged Test", null, null, null, "Traditional, arr. Garcia", null, null, null, null, F, F, F, "arranged-test", null],
    [7, "Smith Test", null, null, null, "Traditional/Arthur Smith, arr. Garcia", null, null, null, null, F, F, F, "smith-test", null],
    [8, "Review Test", null, null, null, "Grateful Dead", null, null, null, null, F, F, F, "review-test", null],
    [9, "Version Test", null, "Garcia / Lesh", null, null, "Lloyd Price version", null, null, null, F, F, F, "version-test", "From Barry Melton's \"Level With Me\" album"],
    [10, "Unknown Song", null, null, null, null, null, null, null, null, F, F, F, "unknown-song", null],
    [11, "Unknown Instrumental", null, null, null, null, null, null, null, null, F, F, T, "unknown-instrumental", null],
    [12, "Typo Test", null, null, null, "Tradititional", null, null, null, null, F, F, F, "typo-test", null],
    [13, "Bracket Test", null, null, null, "Traditional (Hunter)", null, null, null, null, F, F, F, "bracket-test", null],
    [14, "Sebastian Test", null, null, null, "Traditional, arr. Sebastian", null, null, null, null, F, F, F, "sebastian-test", null],
    [15, "Amagamalin Street", null, null, null, null, null, null, null, null, F, F, F, "amagamalin-street", null],
    [16, "Freiberg One", null, "David Freiberg", null, null, null, null, null, null, F, F, F, "freiberg-one", null],
    [17, "Freiberg Two", null, "Dave Freiberg", null, null, null, null, null, null, F, F, F, "freiberg-two", null],
    [18, "Freiberg Three", null, "Freiberg", null, null, null, null, null, null, F, F, F, "freiberg-three", null],
    [19, "Pigpen Test", null, "Pigpen", null, null, null, null, null, null, F, F, F, "pigpen-test", null],
    [20, "Freiberg Four", null, "Cass Freiberg", null, null, null, null, null, null, F, F, F, "freiberg-four", null],
  ]],
  ["song_vocalists", ["id", "song_id", "musician_id", "vocal_role"], [[1, 2, 3, "lead"], [2, 1, 2, "harmony"], [3, 3, 4, "mystery"]]],
  ["tags", ["id", "name"], [[1, "Terrapin"], [2, "dylan"], [3, "unused"], [4, "amagamalin-suite"], [5, "eagle-mall-suite"]]],
  ["song_tags", ["id", "song_id", "tag_id"], [[1, 4, 1], [2, 1, 2], [3, 5, 4], [4, 6, 5]]],
  ["events", ["id", "year", "month", "day", "display_date", "date_uncertain", "venue_id", "venue_uncertain", "event_type_id", "content_type_id", "primary_band_id", "hunter_participation_uncertain", "billing", "public_notes", "verified", "is_uncertain", "show_timing", "raw_data", "is_public", "etree_show_id", "slug"], [
    [1, 1999, 1, 2, "1999-01-02", F, 1, F, 1, 1, 1, F, "Test Band with Test Opener", "Taped by a fan.\nContributor: Test Contributor\nOpening act: Test Opener", T, F, "Early", "Contributor: Test Contributor\nsetlist text of the entry", T, "12345", "e1"],
    [2, 1999, 1, 2, "1999-01-02", F, 1, F, 1, 1, 1, F, null, null, F, F, "Late", null, T, null, "e2"],
    [3, 1975, 6, 1, "June 1st, 1975?", F, 2, T, 1, 1, 1, T, null, null, F, T, "Early", null, T, null, "e3"],
    [4, 1980, 3, 4, "1980-03-04", F, 2, F, 2, 1, 1, F, null, null, F, F, null, null, T, null, "e4"],
    [5, 2099, 12, 20, null, F, 1, F, 1, 1, 1, F, null, null, F, F, null, null, T, null, "e5"],
    [6, 1999, 5, 5, "May 5, 1999", F, 1, F, 1, 2, 1, F, null, null, F, F, null, null, T, null, "e6"],
    [7, 1990, 2, 2, "1990-02-02", F, 1, F, 1, 1, 1, F, null, "Private show note", F, F, null, null, F, null, "e7"],
    [8, 1991, 7, 7, "1991-07-07", F, 3, F, 1, 1, 1, F, null, null, F, F, null, null, T, null, "e8"],
    [9, 1992, 1, 1, "1992-01-01", F, 1, F, 1, 2, 1, F, null, null, F, F, null, null, F, null, "e9"],
    [10, 1993, 3, 3, "1993-03-03", F, 1, F, 1, 1, 1, F, null, null, F, F, null, null, T, null, "e10"],
    [11, 1993, 3, 3, "1993-03-03", F, 1, F, 1, 1, 1, F, null, null, F, F, null, null, T, null, "e11"],
    [12, 1993, 4, 4, "1993-04-04", F, 1, F, 1, 1, 1, F, null, null, F, F, "8:00", null, T, null, "e12"],
    [13, 1976, 6, null, "Summer 1976", F, 1, F, 1, 1, 1, F, "Opened for Test Act", null, F, F, null, null, T, null, "e13"],
    [14, 1977, 6, 5, "June 5, 1977 (Afternoon)", F, 1, F, 1, 1, 1, F, "Comfort opened for the Jerry Garcia Band", null, F, F, null, null, T, null, "e14"],
    [15, 1978, 2, 2, "1978-02-02", F, 5, F, 1, 1, 1, F, null, null, F, F, null, null, T, null, "e15"],
    [16, 1979, 3, 3, "1979-03-03", F, 1, F, 1, 3, 1, F, null, null, F, F, null, null, T, null, "e16"],
    [17, 1981, 4, 4, "1981-04-04", F, 8, F, 3, 1, 1, F, null, null, F, F, null, null, T, null, "e17"],
  ]],
  ["event_musicians", ["id", "event_id", "musician_id", "instrument_id", "includes_vocals", "private_notes"], [
    [1, 1, 2, 1, F, null],
    [2, 1, 1, 1, T, null],
    [3, 1, 2, 1, T, null],
    [4, 1, 2, 1, F, "Lineup row remark"],
    [5, 5, 2, 1, F, null],
  ]],
  ["event_musician_instruments", ["id", "event_musician_id", "instrument_id"], [[1, 5, 2]]],
  ["set_musicians", ["id", "set_id", "musician_id", "instrument_id", "includes_vocals"], [[1, 5, 2, 1, F], [2, 1, 4, 2, F]]],
  ["event_contributors", ["id", "event_id", "contributor_id", "description", "private_notes"], [[1, 1, 1, null, "Contributor row remark"], [2, 2, 1, "Provided the tape", null]]],
  ["sets", ["id", "event_id", "set_type_id", "position", "is_uncertain", "band_id"], [[1, 1, 1, 1, F, null], [2, 1, 3, 2, F, null], [3, 2, 2, 1, F, null], [4, 3, 1, 1, T, null], [5, 5, 1, 1, F, null], [6, 7, 5, 1, F, null], [7, 6, 1, 1, F, null], [8, 16, 1, 1, F, null]]],
  ["performances", ["id", "set_id", "song_id", "performance_order", "segues_into", "is_truncated_start", "has_cuts", "is_partial", "public_notes", "is_uncertain", "lead_vocals_id", "is_lyrical_fragment", "is_medley", "is_musical_fragment", "is_solo_hunter", "is_aborted"], [
    [1, 1, 1, 1, T, F, F, T, "Last verse only", F, 2, F, F, F, F, F],
    [2, 1, 2, 2, F, F, F, F, "Sung a cappella.", T, null, T, T, F, F, F],
    [3, 1, 3, 3, F, T, T, F, null, F, null, F, F, T, T, F],
    [4, 2, 1, 1, F, F, F, F, null, F, null, F, F, F, F, T],
    [5, 3, 4, 1, F, F, F, F, null, F, null, F, F, F, F, F],
    [6, 4, 1, 1, F, F, F, F, "Teases another song; reportedly played, not on the tape.", F, null, F, F, F, F, F],
    [7, 5, 1, 1, F, F, F, F, null, F, null, F, F, F, F, F],
    [8, 6, 1, 1, F, F, F, F, "Hunter does not play on this one. From Test Band's album.", F, null, F, F, F, F, F],
    [9, 4, 2, 2, F, F, F, F, null, F, null, F, F, F, F, F],
    [10, 7, 1, 1, F, F, F, F, null, F, null, F, F, F, F, F],
    [11, 3, 10, 2, F, F, F, F, null, F, null, F, F, F, F, F],
    [12, 3, 11, 3, F, F, F, F, null, F, null, F, F, F, F, F],
  ]],
  ["performance_vocalists", ["id", "performance_id", "musician_id", "vocal_role"], [[1, 1, 3, "Harmony"], [2, 1, 4, "backing"], [3, 2, 4, "scat"]]],
  ["performance_musicians", ["id", "performance_id", "musician_id", "instrument_id", "includes_vocals"], [[1, 1, 2, 1, F], [2, 2, 1, null, F], [3, 7, 2, 1, F], [4, 5, 3, null, F]]],
  // The real form: the flag is false and a "vocals" instrument row marks the singer (row 4).
  ["performance_musician_instruments", ["id", "performance_musician_id", "instrument_id"], [[1, 2, 2], [2, 4, 3]]],
  ["show_banter", ["id", "performance_id", "banter_text", "is_before_song", "is_verbatim"], [[1, 1, "Banter text one", T, T], [2, 1, "Banter text two", F, F], [3, 7, "Banter in the test show", T, T]]],
  ["recordings", ["id", "event_id", "recording_type_id", "taper", "shn_id", "lma_identifier", "contributor_id", "length_minutes"], [[1, 1, 1, "Test Taper", "shn1", "gd99-01-02.test", 1, 90], [2, 5, 1, null, null, null, null, null], [3, 1, 2, null, null, "\tgd00-01-01.messy//", null, null]]],
  ["links", ["id", "url", "title", "isActive", "is_public", "event_id", "song_id", "link_type_id", "recording_id"], [
    [1, "https://en.wikipedia.org/wiki/Test", "A title", T, T, null, 1, 1, null],
    [2, "https://whitegum.example/alpha", null, T, T, null, 1, null, null],
    [3, "https://blog.example/x", null, T, T, null, 2, 2, null],
    [4, "https://www.youtube.com/watch?v=abcdefghijk", null, T, F, 1, null, 3, null],
    [5, "https://www.youtube.com/watch?v=zyxwvutsrqp", null, F, T, 1, null, 3, null],
    [6, "https://www.whitegum.com/songfile/Beta.htm#verse", null, T, T, null, 2, null, null],
    [7, "https://archive.org/details/gd99-01-02.test2", "LMA copy", T, T, null, null, 4, 1],
    // A page in a query string, and a page outside /songfile/ (listed, no outside ID).
    [8, "https://www.whitegum.com/introjs.htm?/songfile/STAGGERL.HTM", null, T, T, null, 3, null, null],
    [9, "https://www.whitegum.com/stagroot.htm", null, T, T, null, 3, null, null],
  ]],
  ["albums", ["id", "title", "artist", "release_year", "is_official", "slug"], [
    [1, "Test Album", "Test Group", 1990, T, "test-album"],
    [2, "Rock Columbia", null, null, T, "rock-columbia"],
    [3, "Doubled Title 50th Bonus DiscDoubled Title 50th Bonus Disc", null, null, T, null],
    [4, "Sentinel", null, null, T, null],
    [5, "Amagamalin Street", null, 1984, T, null],
  ]],
  ["song_albums", ["id", "song_id", "album_id", "track_number"], [[1, 1, 1, null], [2, 5, 2, 3], [3, 6, 2, 4], [4, 1, 4, null], [5, 10, 1, null], [6, 5, 5, 1]]],
  ["rss_entries", ["id", "title"], [[1, "A post"]]],
  ["data_migrations", ["id", "filename"], [[1, "a.sql"]]],
];

// Old creation dates, set after the insert: [table, id, timestamp].
// Columns the DATA rows leave out, set after the insert: [table, id, column, value].
const EXTRA: Array<[string, number, string, string]> = [
  ["events", 1, "private_notes", "Old private note of the show"],
  ["events", 1, "raw_data_gdsets", "gdsets entry text"],
  // A raw entry that holds JSON text: the archive keeps it as parsed JSON.
  ["events", 3, "raw_data", '{"setlist":["Alpha Song","Beta Song"]}'],
];

const CREATED: Array<[string, number, string]> = [
  ["events", 1, "2001-02-03 04:05:06"],
  ["songs", 1, "2002-03-04 05:06:07"],
  ["musicians", 2, "2003-04-05 06:07:08"],
  ["performances", 1, "2004-05-06 07:08:09"],
  ["venues", 1, "2005-06-07 08:09:10"],
];

/** Build the schema and fill it. Drops an earlier copy first. */
export async function buildLegacyFixture(client: Client): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${LEGACY_SCHEMA} CASCADE`);
  await client.query(`CREATE SCHEMA ${LEGACY_SCHEMA}`);
  for (const [table, columns] of Object.entries(TABLES)) {
    await client.query(`CREATE TABLE ${LEGACY_SCHEMA}.${table} (${columns}, created_at timestamp)`);
  }
  for (const [table, columns, rows] of DATA) {
    for (const row of rows) {
      const placeholders = row.map((_, index) => `$${index + 1}`).join(", ");
      await client.query(`INSERT INTO ${LEGACY_SCHEMA}.${table} (${columns.map((column) => `"${column}"`).join(", ")}) VALUES (${placeholders})`, row);
    }
  }
  for (const [table, id, column, value] of EXTRA) {
    await client.query(`UPDATE ${LEGACY_SCHEMA}.${table} SET "${column}" = $1 WHERE id = $2`, [value, id]);
  }
  for (const [table, id, at] of CREATED) {
    await client.query(`UPDATE ${LEGACY_SCHEMA}.${table} SET created_at = $1 WHERE id = $2`, [at, id]);
  }
}

export async function dropLegacyFixture(client: Client): Promise<void> {
  await client.query(`DROP SCHEMA IF EXISTS ${LEGACY_SCHEMA} CASCADE`);
}
