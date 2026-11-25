import { randomBytes } from "node:crypto";
import { query } from "./auth-fixtures";

/**
 * One invented show for the browser tests, written with plain SQL (Playwright cannot load the
 * Prisma client). Names carry a random suffix, so parallel tests and repeated runs never collide.
 * Synthetic data only.
 */
export interface SeededShow {
  showId: number;
  placeName: string;
  workTitle: string;
  summaries: [string, string, string];
  wordsAsHeard: string;
}

async function entity(kind: string): Promise<number> {
  const rows = await query<{ id: number }>(`INSERT INTO entities (kind) VALUES ($1::"EntityKind") RETURNING id`, [kind]);
  return rows[0].id;
}

async function listRow(table: string, columns: string, values: unknown[]): Promise<number> {
  const marks = values.map((_, i) => `$${i + 1}`).join(", ");
  return (await query<{ id: number }>(`INSERT INTO ${table} (${columns}) VALUES (${marks}) RETURNING id`, values))[0].id;
}

export async function seedShowForReview(): Promise<SeededShow> {
  const tag = randomBytes(4).toString("hex");
  const placeName = `Test Radio ${tag}`;
  const workTitle = `Test Song ${tag}`;
  const summaries: SeededShow["summaries"] = [`Opening talk ${tag}.`, `Reply to the opening ${tag}.`, `Closing talk ${tag}.`];
  const wordsAsHeard = `Words as heard ${tag}`;

  const workKindId = await listRow("work_kinds", "name", [`kind ${tag}`]);
  const setTypeId = await listRow("set_types", `name, "displayName"`, [`type ${tag}`, "First set"]);
  const showTypeId = await listRow("show_types", "name", [`show type ${tag}`]);
  const referenceKindId = await listRow("reference_kinds", "name", [`mentions ${tag}`]);

  const placeId = await entity("PLACE");
  await query(`INSERT INTO places (id, "updatedAt") VALUES ($1, now())`, [placeId]);
  const placeNameId = await entity("PLACE_NAME");
  await query(`INSERT INTO place_names (id, "placeId", name, position, "updatedAt") VALUES ($1, $2, $3, 1, now())`, [placeNameId, placeId, placeName]);
  const bandId = await entity("BAND");
  await query(`INSERT INTO bands (id, name, "updatedAt") VALUES ($1, $2, now())`, [bandId, `Test Band ${tag}`]);
  const workId = await entity("WORK");
  await query(`INSERT INTO works (id, title, "workKindId", "updatedAt") VALUES ($1, $2, $3, now())`, [workId, workTitle, workKindId]);
  const sourceId = await entity("SOURCE");
  await query(`INSERT INTO sources (id, key, title, "updatedAt") VALUES ($1, $2, $3, now())`, [sourceId, `key-${tag}`, `Test Notebook ${tag}`]);

  const showId = await entity("SHOW");
  await query(
    `INSERT INTO shows (id, "dateYear", "dateMonth", "dateDay", "placeId", "placeNameId", "bandId", "showTypeId", "updatedAt")
     VALUES ($1, 1980, 11, 14, $2, $3, $4, $5, now())`,
    [showId, placeId, placeNameId, bandId, showTypeId],
  );
  const setId = await entity("SET");
  await query(`INSERT INTO sets (id, "showId", position, "setTypeId", "updatedAt") VALUES ($1, $2, 1, $3, now())`, [setId, showId, setTypeId]);

  // The parent has the later key on purpose: a child follows its parent, whatever its key.
  const firstId = await entity("SEGMENT");
  await query(`INSERT INTO segments (id, "setId", "sortKey", summary, delivery, "workId", "updatedAt") VALUES ($1, $2, 'a', $3, 'SPOKEN', NULL, now())`, [firstId, setId, summaries[0]]);
  const secondId = await entity("SEGMENT");
  await query(
    `INSERT INTO segments (id, "setId", "sortKey", summary, delivery, "wordsAsHeard", "joinsNext", "updatedAt")
     VALUES ($1, $2, 'b', $3, 'SPOKEN', $4, 'RUNS_INTO', now())`,
    [secondId, setId, summaries[1], wordsAsHeard],
  );
  const childId = await entity("SEGMENT");
  await query(`INSERT INTO segments (id, "setId", "parentId", "sortKey", summary, delivery, "updatedAt") VALUES ($1, $2, $3, 'a', $4, 'SPOKEN', now())`, [childId, setId, firstId, summaries[2]]);

  const referenceId = await entity("REFERENCE");
  await query(
    `INSERT INTO "references" (id, "fromId", "toId", "referenceKindId", certainty, note, "updatedAt")
     VALUES ($1, $2, $3, $4, 'PROBABLE', 'Mentioned in passing', now())`,
    [referenceId, secondId, workId, referenceKindId],
  );
  await query(
    `INSERT INTO citations ("entityId", "sourceId", aspect, place, excerpt, "updatedAt")
     VALUES ($1, $2, 'SEGMENT_IDENTIFICATION', 'page 4', 'A private excerpt', now())`,
    [secondId, sourceId],
  );
  const note = await query<{ id: number }>(`INSERT INTO notes (body, "isPublic", "updatedAt") VALUES ('A private note', false, now()) RETURNING id`);
  await query(`INSERT INTO note_attachments ("noteId", "entityId") VALUES ($1, $2)`, [note[0].id, secondId]);

  return { showId, placeName, workTitle, summaries: [summaries[0], summaries[1], summaries[2]], wordsAsHeard };
}
