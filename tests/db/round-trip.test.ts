import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";

// A real write-and-read against Postgres through the driver adapter. This is the
// check that would have caught the old app's Node 22 database failure early.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL must be set to run the database tests");

const prisma = createPrismaClient(url);

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database round trip", () => {
  it("writes, reads back and deletes a row", async () => {
    const note = `round-trip ${Date.now()}`;
    const created = await prisma.systemCheck.create({ data: { note } });
    try {
      const found = await prisma.systemCheck.findUnique({ where: { id: created.id } });
      expect(found?.note).toBe(note);
    } finally {
      await prisma.systemCheck.delete({ where: { id: created.id } });
    }
  });

  it("runs on Postgres 18 or later", async () => {
    const rows = await prisma.$queryRaw<{ server_version_num: string }[]>`SHOW server_version_num`;
    expect(Number(rows[0].server_version_num)).toBeGreaterThanOrEqual(180000);
  });
});
