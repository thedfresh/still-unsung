import { afterAll, beforeEach, describe, expect, it } from "vitest";
import type { EntityKind } from "@/generated/prisma/enums";
import { createPrismaClient } from "@/lib/db";
import { seedLists } from "../../prisma/seed/index";
import { resetDatabase } from "../support/reset-database";

// The rules the database enforces itself: check constraints, restricted deletes, cascades,
// byte-order sort keys and trigram search. The data comes from the seed lists only.
const prisma = createPrismaClient(process.env.DATABASE_URL ?? "");

async function entity(kind: EntityKind): Promise<number> {
  return (await prisma.entity.create({ data: { kind } })).id;
}

async function makePerson(key = "p1") {
  return prisma.person.create({ data: { id: await entity("PERSON"), key, name: key } });
}

async function makeBand(name = "Band") {
  return prisma.band.create({ data: { id: await entity("BAND"), name } });
}

async function makeWork(title = "Title") {
  const kind = await prisma.workKind.findFirstOrThrow();
  return prisma.work.create({ data: { id: await entity("WORK"), title, workKindId: kind.id } });
}

async function makeShow(data: Record<string, unknown> = {}) {
  return prisma.show.create({ data: { id: await entity("SHOW"), ...data } as never });
}

async function makeSet(showId: number) {
  const setType = await prisma.setType.findFirstOrThrow();
  return prisma.set.create({ data: { id: await entity("SET"), showId, position: 1, setTypeId: setType.id } });
}

/** The database itself must refuse the write. A Prisma input error would not prove a rule. */
async function expectDatabaseRefuses(write: Promise<unknown>): Promise<void> {
  const error = await write.then(
    () => null,
    (caught: unknown) => caught,
  );
  expect(error).not.toBeNull();
  expect((error as Error).name).not.toBe("PrismaClientValidationError");
}

beforeEach(async () => {
  await resetDatabase(prisma);
  await seedLists(prisma);
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("partial dates", () => {
  it("accepts a year only, a year and month, and a full date", async () => {
    await makeShow({ dateYear: 1980 });
    await makeShow({ dateYear: 1980, dateMonth: 5 });
    await makeShow({ dateYear: 1980, dateMonth: 5, dateDay: 31 });
    expect(await prisma.show.count()).toBe(3);
  });

  it("accepts a date range", async () => {
    await makeShow({ dateYear: 1980, dateMonth: 5, dateDay: 1, dateEndYear: 1980, dateEndMonth: 5, dateEndDay: 3 });
    expect(await prisma.show.count()).toBe(1);
  });

  it.each([
    ["a month above 12", { dateYear: 1980, dateMonth: 13 }],
    ["a month of 0", { dateYear: 1980, dateMonth: 0 }],
    ["a day above 31", { dateYear: 1980, dateMonth: 1, dateDay: 32 }],
    ["a day without a month", { dateYear: 1980, dateDay: 4 }],
    ["a month without a year", { dateMonth: 4 }],
    ["an end day without an end month", { dateYear: 1980, dateEndYear: 1980, dateEndDay: 4 }],
    ["an end month without an end year", { dateYear: 1980, dateEndMonth: 4 }],
  ])("rejects %s", async (_name, data) => {
    await expectDatabaseRefuses(makeShow(data));
  });
});

describe("exactly-one and at-least-one rules", () => {
  it("lineup entry: exactly one of band, show, set, segment", async () => {
    const person = await makePerson();
    const band = await makeBand();
    const show = await makeShow();
    const data = async () => ({ id: await entity("LINEUP_ENTRY"), personId: person.id });
    await expectDatabaseRefuses(prisma.lineupEntry.create({ data: await data() }));
    await expectDatabaseRefuses(prisma.lineupEntry.create({ data: { ...(await data()), bandId: band.id, showId: show.id } }),);
    await prisma.lineupEntry.create({ data: { ...(await data()), showId: show.id } });
  });

  it("lineup entry: member dates only at band level", async () => {
    const person = await makePerson();
    const band = await makeBand();
    const show = await makeShow();
    await prisma.lineupEntry.create({
      data: { id: await entity("LINEUP_ENTRY"), personId: person.id, bandId: band.id, dateYear: 1970 },
    });
    await expectDatabaseRefuses(prisma.lineupEntry.create({
        data: { id: await entity("LINEUP_ENTRY"), personId: person.id, showId: show.id, dateYear: 1970 },
      }),);
  });

  it("bill entry: one of show or group, and one of band or person", async () => {
    const show = await makeShow();
    const band = await makeBand();
    const person = await makePerson();
    const make = async (extra: Record<string, number>) =>
      prisma.billEntry.create({ data: { id: await entity("BILL_ENTRY"), position: 1, role: "HEADLINER", ...extra } as never });
    await expectDatabaseRefuses(make({ showId: show.id }));
    await expectDatabaseRefuses(make({ showId: show.id, actBandId: band.id, actPersonId: person.id }));
    await make({ showId: show.id, actBandId: band.id });
  });

  it("credit: exactly one of work or version", async () => {
    const person = await makePerson();
    const work = await makeWork();
    const role = await prisma.creditRole.findFirstOrThrow();
    const base = async () => ({
      id: await entity("CREDIT"), personId: person.id, roleId: role.id, kind: "AS_CREDITED" as const,
    });
    await expectDatabaseRefuses(prisma.credit.create({ data: await base() }));
    await prisma.credit.create({ data: { ...(await base()), workId: work.id } });
  });

  it("citation: needs a source, a recording or a contributor", async () => {
    const show = await makeShow();
    const person = await makePerson();
    await expectDatabaseRefuses(prisma.citation.create({ data: { entityId: show.id } }));
    await prisma.citation.create({ data: { entityId: show.id, contributorId: person.id } });
  });

  it("changeset: needs evidence or the curator's own knowledge", async () => {
    const user = await prisma.user.create({ data: { role: "ADMIN" } });
    await expectDatabaseRefuses(prisma.changeset.create({ data: { userId: user.id, path: "ADMIN", summary: "test" } }),);
    await prisma.changeset.create({ data: { userId: user.id, path: "ADMIN", summary: "test", ownKnowledge: true } });
  });

  it("passage: a motif key exactly when the kind is MOTIF", async () => {
    const work = await makeWork();
    const make = async (data: Record<string, unknown>) =>
      prisma.passage.create({ data: { id: await entity("PASSAGE"), workId: work.id, label: "x", ...data } as never });
    await expectDatabaseRefuses(make({ kind: "MOTIF" }));
    await expectDatabaseRefuses(make({ kind: "FIXED", motifKey: "k" }));
    await make({ kind: "MOTIF", motifKey: "k" });
    await make({ kind: "FIXED" });
  });
});

describe("self references", () => {
  it("a place or a segment cannot be its own parent", async () => {
    const place = await prisma.place.create({ data: { id: await entity("PLACE") } });
    await expectDatabaseRefuses(prisma.place.update({ where: { id: place.id }, data: { parentId: place.id } }));
    const set = await makeSet((await makeShow()).id);
    const segment = await prisma.segment.create({
      data: { id: await entity("SEGMENT"), setId: set.id, sortKey: "a0" },
    });
    await expectDatabaseRefuses(prisma.segment.update({ where: { id: segment.id }, data: { parentId: segment.id } }),);
  });
});

describe("ordering, deletes and search", () => {
  it("sorts segment keys in byte order, not by locale", async () => {
    const set = await makeSet((await makeShow()).id);
    for (const sortKey of ["a0", "B0", "a1", "Zz"]) {
      await prisma.segment.create({ data: { id: await entity("SEGMENT"), setId: set.id, sortKey } });
    }
    const rows = await prisma.$queryRaw<{ sortKey: string }[]>`SELECT "sortKey" FROM segments ORDER BY "sortKey"`;
    expect(rows.map((row) => row.sortKey)).toEqual(["B0", "Zz", "a0", "a1"]);
  });

  it("refuses to delete a record that other records point at", async () => {
    const work = await makeWork();
    const set = await makeSet((await makeShow()).id);
    await prisma.segment.create({
      data: { id: await entity("SEGMENT"), setId: set.id, sortKey: "a0", workId: work.id },
    });
    await expectDatabaseRefuses(prisma.entity.delete({ where: { id: work.id } }));
    await expectDatabaseRefuses(prisma.show.delete({ where: { id: set.showId } }));
  });

  it("deletes the record when its entity row goes", async () => {
    const person = await makePerson("gone");
    await prisma.entity.delete({ where: { id: person.id } });
    expect(await prisma.person.findUnique({ where: { id: person.id } })).toBeNull();
  });

  it("finds a title by trigram similarity", async () => {
    await makeWork("Sample Song One");
    await makeWork("Unrelated Words");
    const rows = await prisma.$queryRaw<{ title: string }[]>`
      SELECT title FROM works WHERE title % 'Sampel Song' ORDER BY similarity(title, 'Sampel Song') DESC`;
    expect(rows.map((row) => row.title)).toEqual(["Sample Song One"]);
  });

  it("keeps a unique key per person", async () => {
    await makePerson("same");
    await expectDatabaseRefuses(makePerson("same"));
  });
});
