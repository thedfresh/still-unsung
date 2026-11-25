import path from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { runImport } from "./index.ts";
import { assertOutsideRepo, assertSafeTarget, readSettings } from "./settings.ts";

// Usage: npm run db:import-legacy
// Reads the old copy (LEGACY_DATABASE_URL, read only) and rebuilds the database in DATABASE_URL.
// See the README, "Import from the old database".
const settings = readSettings(process.env);
assertSafeTarget(settings.targetUrl, settings.legacyUrl);
assertOutsideRepo(settings.outputDir, path.resolve(import.meta.dirname, "../.."));

const legacyPool = new pg.Pool({
  connectionString: settings.legacyUrl,
  // Read only: the script never writes to the old copy.
  options: "-c default_transaction_read_only=on",
});
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: settings.targetUrl }) });
try {
  const { unaccounted, reportPath } = await runImport({
    legacyPool,
    legacySchema: settings.legacySchema,
    db,
    settings,
    outputDir: settings.outputDir,
  });
  console.log(`Import done. Report: ${reportPath}`);
  if (unaccounted > 0) {
    console.error(`${unaccounted} old rows are not accounted for. Read the report.`);
    process.exitCode = 1;
  }
} finally {
  await db.$disconnect();
  await legacyPool.end();
}
