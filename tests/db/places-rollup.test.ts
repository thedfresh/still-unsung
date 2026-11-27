import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { seedLists } from "../../prisma/seed/index.ts";
import { getEntityDetail, listEntities } from "@/lib/data/entity-lists";
import { countShowsInPlace } from "@/lib/data/places";
import { getPrisma } from "@/lib/db";
import { resetDatabase } from "../support/reset-database";

const db = getPrisma();

beforeEach(async () => {
  await resetDatabase(db);
  await seedLists(db);
});
afterAll(async () => {
  await db.$disconnect();
});

async function place(name: string, parentId: number | null = null, kind?: string) {
  const entity = await db.entity.create({ data: { kind: "PLACE" } });
  const placeKindId = kind ? (await db.placeKind.upsert({ where: { name: kind }, update: {}, create: { name: kind } })).id : undefined;
  await db.place.create({ data: { id: entity.id, ...(parentId === null ? {} : { parentId }), ...(placeKindId ? { placeKindId } : {}) } });
  const nameEntity = await db.entity.create({ data: { kind: "PLACE_NAME" } });
  await db.placeName.create({ data: { id: nameEntity.id, placeId: entity.id, name, position: 1 } });
  return entity.id;
}

async function show(placeId: number | null, day: number) {
  const entity = await db.entity.create({ data: { kind: "SHOW" } });
  await db.show.create({ data: { id: entity.id, dateYear: 1990, dateMonth: 1, dateDay: day, ...(placeId === null ? {} : { placeId }) } });
}

describe("place roll-up (HSA-185)", () => {
  it("counts the shows at the places inside a city and a state", async () => {
    const washington = await place("Washington");
    const olympia = await place("Olympia", washington);
    const tavern = await place("4th Avenue Tavern", olympia);
    const seattle = await place("Seattle", washington);
    await show(tavern, 1);
    await show(olympia, 2); // a show whose venue is not known
    await show(seattle, 3);
    await show(null, 4); // no place: never counted

    expect(await countShowsInPlace(tavern)).toEqual({ direct: 1, inside: 1 });
    expect(await countShowsInPlace(olympia)).toEqual({ direct: 1, inside: 2 });
    expect(await countShowsInPlace(washington)).toEqual({ direct: 0, inside: 3 });
  });

  it("shows both numbers on the admin place page", async () => {
    const olympia = await place("Olympia");
    const tavern = await place("4th Avenue Tavern", olympia);
    await show(tavern, 1);
    const facts = Object.fromEntries((await getEntityDetail("places", olympia))?.facts ?? []);
    expect(facts["Shows here and inside"]).toBe("1 show");
    expect(facts["Shows attached here"]).toBe("0 shows");
  });

  it("lists venues by default with their full path, and filters by kind or by a place they are in", async () => {
    const washington = await place("Washington", null, "region");
    const olympia = await place("Olympia", washington, "city");
    await place("4th Avenue Tavern", olympia, "venue");
    await place("Seattle", washington, "city");
    await place("Unsorted Hall");

    const venues = await listEntities("places", "", "name", 1);
    expect(venues.rows.map((r) => [r.name, r.detail])).toEqual([["4th Avenue Tavern", "Olympia, Washington"]]);

    const cities = await listEntities("places", "", "name", 1, "city");
    expect(cities.rows.map((r) => r.name)).toEqual(["Olympia", "Seattle"]);

    expect((await listEntities("places", "olympia", "name", 1)).rows.map((r) => r.name)).toEqual(["4th Avenue Tavern"]);
    expect((await listEntities("places", "", "name", 1, "none")).rows.map((r) => r.name)).toEqual(["Unsorted Hall"]);
    expect((await listEntities("places", "", "name", 1, "all")).total).toBe(5);
  });
});
