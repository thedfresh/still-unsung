import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { Ctx, Legacy, applyCreatedDates, type Settings } from "./context.ts";
import { seedFixedPeople, seedLists, seedSources, seedUsers } from "./lists.ts";
import { collectMergeProposals, writeProposals } from "./proposals.ts";
import { writeReport } from "./report.ts";
import { runStressTests } from "./stress.ts";
import { importAlbums } from "./step-albums.ts";
import { flushEvidence, flushNotes, importLinks, importRecordingCandidates } from "./step-evidence.ts";
import { importLineups } from "./step-lineups.ts";
import { importBands, importPeople, importPlaces } from "./step-people.ts";
import { importSegments } from "./step-segments.ts";
import { importInterviews, importShows } from "./step-shows.ts";
import { importWorks } from "./step-works.ts";

// The legacy import (HSA-37): reads the old database copy, writes the new schema, never
// classifies. Each run empties the target and rebuilds it (item 49); there is no upsert.
// The order follows plan section 1: each step reads only the old copy and the steps before it.

export interface ImportOptions {
  legacyPool: Pool;
  legacySchema: string;
  db: PrismaClient;
  settings: Settings;
  outputDir: string;
}

/** Empty every table except the migration history. The caller has checked the target name. */
export async function emptyTarget(db: PrismaClient): Promise<void> {
  const rows = await db.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const names = rows.map((row) => `"${row.tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}

export async function runImport(options: ImportOptions): Promise<{ unaccounted: number; reportPath: string }> {
  const startedAt = new Date();
  const legacy = await Legacy.open(options.legacyPool, options.legacySchema);
  const ctx = new Ctx(legacy, options.db, options.settings);

  await emptyTarget(options.db);

  // 1. Lists, fixed records, users and the three sources.
  await seedLists(ctx);
  await seedFixedPeople(ctx);
  await seedUsers(ctx);
  await seedSources(ctx);
  // 2. People, bands, places.
  await importPeople(ctx);
  await importBands(ctx);
  await importPlaces(ctx);
  // 3. Works, with credits, singers and suites.
  await importWorks(ctx);
  // 4. Shows, sets, segments, then who sang and played.
  await importShows(ctx);
  const solo = await importSegments(ctx);
  await importInterviews(ctx);
  await importLineups(ctx, solo);
  // 5 and 6. Recording candidates (a private file: no recording is made), outside IDs, albums.
  await importRecordingCandidates(ctx, options.outputDir);
  await importLinks(ctx);
  await importAlbums(ctx);
  await flushEvidence(ctx);
  // 7 and 8. Notes with their backlinks, then the addresses.
  await flushNotes(ctx);
  ctx.line("Creation dates", `${await applyCreatedDates(ctx)} records carry the old created_at`);

  await collectMergeProposals(ctx);
  const proposalFiles = await writeProposals(ctx, options.outputDir);
  const stress = await runStressTests(ctx);
  await mkdir(options.outputDir, { recursive: true });
  await writeFile(path.join(options.outputDir, "place-chains.tsv"), `${stress.placeChains.join("\n")}\n`);
  const { unaccounted } = await writeReport(ctx, options.outputDir, { startedAt, proposalFiles, stress: stress.results });
  return { unaccounted, reportPath: path.join(options.outputDir, "report.md") };
}
