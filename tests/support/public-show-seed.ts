import { randomBytes } from "node:crypto";
import { query } from "./auth-fixtures";

/**
 * One invented show for the public page tests, written with plain SQL (Playwright cannot load the
 * Prisma client). It has fragments, a tease, a portion, a segue chain, a talk segment, a suite,
 * and private records of every kind the public layer must hide. Names carry a random suffix, so
 * parallel tests never collide. Synthetic data only.
 */
export interface PublicShowFixture {
  showId: number;
  slug: string;
  /** Text that must appear on the page (standard view). */
  visible: string[];
  /** Text that appears only in the complete view. */
  completeOnly: string[];
  /** Text that must never appear in any HTML of the page. */
  secret: string[];
  workTitles: { alpha: string; beta: string; gamma: string; delta: string; tease: string };
}

async function entity(kind: string, isPublic = true): Promise<number> {
  const rows = await query<{ id: number }>(
    `INSERT INTO entities (kind, "isPublic") VALUES ($1::"EntityKind", $2) RETURNING id`,
    [kind, isPublic],
  );
  return rows[0].id;
}

async function row(table: string, columns: string[], values: unknown[]): Promise<number> {
  const names = columns.map((c) => `"${c}"`).join(", ");
  const marks = values.map((_, i) => `$${i + 1}`).join(", ");
  return (await query<{ id: number }>(`INSERT INTO ${table} (${names}) VALUES (${marks}) RETURNING id`, values))[0].id;
}

async function note(body: string, isPublic: boolean, entityId: number): Promise<void> {
  const id = (await query<{ id: number }>(`INSERT INTO notes (body, "isPublic", "updatedAt") VALUES ($1, $2, now()) RETURNING id`, [body, isPublic]))[0].id;
  await query(`INSERT INTO note_attachments ("noteId", "entityId") VALUES ($1, $2)`, [id, entityId]);
}

interface SegmentInput {
  setId: number;
  key: string;
  workId?: number | null;
  parentId?: number | null;
  joins?: "STOPS" | "RUNS_INTO";
  delivery?: string | null;
  extent?: string;
  portionNote?: string | null;
  summary?: string | null;
  wordsAsHeard?: string | null;
  isPublic?: boolean;
}

async function segment(input: SegmentInput): Promise<number> {
  const id = await entity("SEGMENT", input.isPublic ?? true);
  await query(
    `INSERT INTO segments (id, "setId", "parentId", "sortKey", "workId", "joinsNext", delivery, extent, "portionNote", summary, "wordsAsHeard", "updatedAt")
     VALUES ($1, $2, $3, $4, $5, $6::"Join", $7::"Delivery", $8::"Extent", $9, $10, $11, now())`,
    [
      id,
      input.setId,
      input.parentId ?? null,
      input.key,
      input.workId ?? null,
      input.joins ?? "STOPS",
      input.delivery ?? null,
      input.extent ?? "COMPLETE",
      input.portionNote ?? null,
      input.summary ?? null,
      input.wordsAsHeard ?? null,
    ],
  );
  return id;
}

export async function seedPublicShow(): Promise<PublicShowFixture> {
  const tag = randomBytes(4).toString("hex");
  const titles = {
    alpha: `Alpha ${tag}`,
    beta: `Beta ${tag}`,
    gamma: `Gamma ${tag}`,
    delta: `Delta ${tag}`,
    tease: `Tease ${tag}`,
  };
  const secret = {
    work: `PRIVATE-WORK-${tag}`,
    words: `WORDS-AS-HEARD-${tag}`,
    note: `PRIVATE-NOTE-${tag}`,
    excerpt: `CITATION-EXCERPT-${tag}`,
    legacy: `LEGACY-SECRET-${tag}`,
    talk: `PRIVATE-TALK-${tag}`,
    child: `PRIVATE-CHILD-${tag}`,
    set: `PRIVATE-SET-TITLE-${tag}`,
    recording: `PRIVATE-RECORDING-${tag}`,
  };
  const placeName = `Test Radio ${tag}`;
  const slug = `1980-11-14-test-${tag}`;
  const talkSummary = `A talk about the weather ${tag}.`;
  const showNote = `Public show note ${tag}`;
  const segmentNote = `Public segment note ${tag}`;
  const portion = `last verse only ${tag}`;
  const opener = `Test Opener ${tag}`;
  const billedAs = `Billed as Test Show ${tag}`;
  const recordingText = `Test master tape ${tag}`;

  const workKindId = await row("work_kinds", ["name"], [`kind ${tag}`]);
  const setTypeId = await row("set_types", ["name", "displayName"], [`first ${tag}`, `First set ${tag}`]);
  const encoreTypeId = await row("set_types", ["name", "displayName"], [`encore ${tag}`, `Encore ${tag}`]);
  const linkSystemId = await query<{ id: number }>(
    `INSERT INTO link_systems (name, purpose, "urlTemplate") VALUES ($1, 'LISTEN'::"LinkPurpose", 'https://example.test/details/{value}') RETURNING id`,
    [`Test Archive ${tag}`],
  ).then((rows) => rows[0].id);
  const recordingTypeId = await row("recording_types", ["name"], [`SBD ${tag}`]);

  const work = async (title: string, isPublic = true) => {
    const id = await entity("WORK", isPublic);
    await row("works", ["id", "title", "workKindId", "updatedAt"], [id, title, workKindId, new Date()]);
    return id;
  };
  const [alpha, beta, gamma, delta, tease, hidden] = await Promise.all([
    work(titles.alpha),
    work(titles.beta),
    work(titles.gamma),
    work(titles.delta),
    work(titles.tease),
    work(secret.work, false),
  ]);

  const placeId = await entity("PLACE");
  await query(`INSERT INTO places (id, "updatedAt") VALUES ($1, now())`, [placeId]);
  const placeNameId = await entity("PLACE_NAME");
  await row("place_names", ["id", "placeId", "name", "position", "updatedAt"], [placeNameId, placeId, placeName, 1, new Date()]);
  const bandId = await entity("BAND");
  await row("bands", ["id", "name", "slug", "updatedAt"], [bandId, `Test Band ${tag}`, `test-band-${tag}`, new Date()]);
  const openerId = await entity("BAND");
  await row("bands", ["id", "name", "updatedAt"], [openerId, opener, new Date()]);

  const showId = await entity("SHOW");
  await query(
    `INSERT INTO shows (id, slug, "dateYear", "dateMonth", "dateDay", "placeId", "placeNameId", "bandId", "billedAs", "legacyData", "updatedAt")
     VALUES ($1, $2, 1980, 11, 14, $3, $4, $5, $6, $7::jsonb, now())`,
    [showId, slug, placeId, placeNameId, bandId, billedAs, JSON.stringify({ secret: secret.legacy })],
  );
  const billId = await entity("BILL_ENTRY");
  await row("bill_entries", ["id", "showId", "actBandId", "role", "position", "updatedAt"], [billId, showId, openerId, "OPENER", 1, new Date()]);
  await note(showNote, true, showId);
  await note(secret.note, false, showId);

  const setOne = await entity("SET");
  await row("sets", ["id", "showId", "position", "setTypeId", "updatedAt"], [setOne, showId, 1, setTypeId, new Date()]);
  const encore = await entity("SET");
  await row("sets", ["id", "showId", "position", "setTypeId", "updatedAt"], [encore, showId, 2, encoreTypeId, new Date()]);
  // A private set: its title and its segments must not appear.
  const hiddenSet = await entity("SET", false);
  await row("sets", ["id", "showId", "position", "setTypeId", "updatedAt"], [hiddenSet, showId, 3, setTypeId, new Date()]);
  await segment({ setId: hiddenSet, key: "a", workId: hidden, summary: secret.set });

  // Set one: Alpha > (private segment) > Beta (fragment, a tease), Gamma (partial), a talk, a suite.
  const alphaId = await segment({ setId: setOne, key: "a", workId: alpha, joins: "RUNS_INTO", wordsAsHeard: secret.words });
  await note(segmentNote, true, alphaId);
  await note(secret.note, false, alphaId);
  const sourceId = await entity("SOURCE");
  await row("sources", ["id", "key", "title", "updatedAt"], [sourceId, `key-${tag}`, `Test Notebook ${tag}`, new Date()]);
  await query(
    `INSERT INTO citations ("entityId", "sourceId", aspect, excerpt, "updatedAt") VALUES ($1, $2, 'SEGMENT_IDENTIFICATION'::"CitationAspect", $3, now())`,
    [alphaId, sourceId, secret.excerpt],
  );
  await segment({ setId: setOne, key: "b", workId: hidden, joins: "RUNS_INTO", isPublic: false });
  await segment({ setId: setOne, key: "c", workId: tease, extent: "FRAGMENT", joins: "STOPS" });
  await segment({ setId: setOne, key: "d", workId: gamma, extent: "PARTIAL", portionNote: portion, joins: "RUNS_INTO" });
  await segment({ setId: setOne, key: "e", workId: delta, delivery: "SUNG_A_CAPPELLA" });
  await segment({ setId: setOne, key: "f", delivery: "SPOKEN", summary: talkSummary });
  await segment({ setId: setOne, key: "g", delivery: "SPOKEN", summary: secret.talk, isPublic: false });
  // A segment with a private work: the page shows no title for it.
  await segment({ setId: setOne, key: "h", workId: hidden });
  const suite = await segment({ setId: setOne, key: "i", workId: beta });
  await segment({ setId: setOne, key: "a", parentId: suite, workId: delta });
  await segment({ setId: setOne, key: "b", parentId: suite, workId: gamma, isPublic: false, summary: secret.child });

  await segment({ setId: encore, key: "a", workId: beta });

  const recording = await entity("RECORDING");
  await row("recordings", ["id", "showId", "recordingTypeId", "description", "lengthMinutes", "updatedAt"], [recording, showId, recordingTypeId, recordingText, 92, new Date()]);
  await query(`INSERT INTO external_ids ("entityId", "linkSystemId", value, "updatedAt") VALUES ($1, $2, $3, now())`, [recording, linkSystemId, `test-${tag}`]);
  const hiddenRecording = await entity("RECORDING", false);
  await row("recordings", ["id", "showId", "description", "updatedAt"], [hiddenRecording, showId, secret.recording, new Date()]);

  return {
    showId,
    slug,
    visible: [titles.alpha, titles.beta, titles.gamma, titles.delta, talkSummary, showNote, placeName, opener, billedAs, recordingText],
    completeOnly: [titles.tease, segmentNote, portion],
    secret: Object.values(secret),
    workTitles: titles,
  };
}
