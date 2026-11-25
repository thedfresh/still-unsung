import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "@/lib/db";
import { seed, seedLists } from "../../prisma/seed/index";
import { resetDatabase } from "../support/reset-database";

const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");

beforeAll(async () => {
  await resetDatabase(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("seed", () => {
  it("loads the lists and the sample archive", async () => {
    await seed(prisma);
    expect(await prisma.workKind.count()).toBeGreaterThan(0);
    expect(await prisma.show.count()).toBe(2);
    expect(await prisma.segment.count()).toBe(2);
    expect(await prisma.person.findUnique({ where: { key: "curator" } })).not.toBeNull();
  });

  it("gives every fact record its own entity row of the right kind", async () => {
    const show = await prisma.show.findFirstOrThrow({ include: { entity: true } });
    expect(show.entity.kind).toBe("SHOW");
    const segments = await prisma.segment.findMany({ include: { entity: true } });
    expect(segments.every((row) => row.entity.kind === "SEGMENT")).toBe(true);
  });

  it("keeps a partial date partial, with no filled-in month or day", async () => {
    const show = await prisma.show.findUniqueOrThrow({ where: { slug: "1989-sample" } });
    expect(show.dateYear).toBe(1989);
    expect(show.dateMonth).toBeNull();
    expect(show.dateDay).toBeNull();
    expect(show.dateCertainty).toBe("PROBABLE");
  });

  it("stores certainty as its own value, not as a yes or no", async () => {
    const segment = await prisma.segment.findFirstOrThrow({ where: { workCertainty: "PROBABLE" } });
    expect(segment.extent).toBe("FRAGMENT");
    const defaults = await prisma.segment.findFirstOrThrow({ where: { workCertainty: "CONFIRMED" } });
    expect(defaults.extent).toBe("COMPLETE");
    expect(defaults.joinsNext).toBe("RUNS_INTO");
  });

  it("is safe to run the lists twice", async () => {
    const before = await prisma.setType.count();
    await seedLists(prisma);
    expect(await prisma.setType.count()).toBe(before);
  });
});
