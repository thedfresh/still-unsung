import type { PrismaClient } from "@/generated/prisma/client";

/**
 * Empty every table of the test database, keeping the migration history. The database tests
 * call this first, so each test starts from nothing. The setup file already refuses any
 * database that is not named `*_test`.
 */
export async function resetDatabase(prisma: PrismaClient): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (rows.length === 0) return;
  const names = rows.map((row) => `"${row.tablename}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE ${names} RESTART IDENTITY CASCADE`);
}
