import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client.ts";
import { seed, seedImportRulesPage, seedLists } from "./index.ts";

// Usage: node --env-file=.env prisma/seed/run.ts [--lists-only | --import-rules-only]
// Loads the synthetic sample archive. Skips a database that already has shows.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  if (process.argv.includes("--import-rules-only")) {
    await seedImportRulesPage(db);
  } else if (process.argv.includes("--lists-only")) {
    await seedLists(db);
  } else if ((await db.show.count()) > 0) {
    console.log("The database already has shows. Seed skipped.");
  } else {
    await seed(db);
  }
  console.log("Seed done.");
} finally {
  await db.$disconnect();
}
