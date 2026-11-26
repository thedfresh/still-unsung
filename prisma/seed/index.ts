import type { PrismaClient } from "../../src/generated/prisma/client.ts";
import { IMPORT_RULES_PLACEHOLDER, IMPORT_RULES_SLUG, IMPORT_RULES_TITLE } from "../../src/lib/import-rules.ts";
import * as lists from "./lists.ts";

// Synthetic seed data for tests and staging (HSA-35). Every name, title and date below is
// invented. No production data and no lyric or source text belongs in this repository.
//
// A fact record needs an Entity row with the same id. `createEntity` makes the row; the
// caller then creates the record with that id.

type Db = PrismaClient;

async function createEntity(db: Db, kind: Parameters<Db["entity"]["create"]>[0]["data"]["kind"]) {
  const row = await db.entity.create({ data: { kind } });
  return row.id;
}

/**
 * Make the private page that holds the agent import rules, if it is missing. It never changes an
 * existing page: the real text is loaded through the MCP tools, not from this repository.
 */
export async function seedImportRulesPage(db: Db): Promise<void> {
  if (await db.guidePage.findUnique({ where: { slug: IMPORT_RULES_SLUG } })) return;
  const entity = await db.entity.create({ data: { kind: "GUIDE_PAGE", isPublic: false } });
  await db.guidePage.create({
    data: { id: entity.id, slug: IMPORT_RULES_SLUG, title: IMPORT_RULES_TITLE, body: IMPORT_RULES_PLACEHOLDER },
  });
}

/** Fill the editable lists and the two accounts that evidence rows name. Safe to run twice. */
export async function seedLists(db: Db): Promise<void> {
  const upsertAll = async (
    table: { upsert: (args: never) => Promise<unknown> },
    rows: Record<string, unknown>[],
  ) => {
    let position = 0;
    for (const row of rows) {
      const { name } = row as { name: string };
      await table.upsert({
        where: { name },
        update: {},
        create: { ...row, position: position++ },
      } as never);
    }
  };
  await upsertAll(db.workKind, lists.workKinds);
  await upsertAll(db.setType, lists.setTypes);
  await upsertAll(db.showType, lists.showTypes);
  await upsertAll(db.showGroupKind, lists.showGroupKinds.map((name) => ({ name })));
  await upsertAll(db.creditRole, lists.creditRoles.map((name) => ({ name })));
  await upsertAll(db.referenceKind, lists.referenceKinds);
  await upsertAll(db.linkSystem, [...lists.linkSystems]);
  await upsertAll(db.recordingType, lists.recordingTypes.map((name) => ({ name })));
  await upsertAll(db.instrument, lists.instruments);
  await upsertAll(db.placeKind, lists.placeKinds.map((name) => ({ name })));
  await upsertAll(db.sourceKind, lists.sourceKinds.map((name) => ({ name })));
  await upsertAll(db.subjectKind, lists.subjectKinds);
  await upsertAll(db.incompleteReason, lists.incompleteReasons.map((name) => ({ name })));
  await upsertAll(db.evidenceKind, lists.evidenceKinds.map((name) => ({ name })));

  // The curator and the agent are people, so a citation can name who says so (checks.md).
  for (const [key, name] of [
    ["curator", "The curator"],
    ["claude", "Claude"],
  ] as const) {
    if (await db.person.findUnique({ where: { key } })) continue;
    const id = await createEntity(db, "PERSON");
    await db.person.create({ data: { id, key, name } });
  }
  await seedImportRulesPage(db);
}

/**
 * A small invented archive: one band, one place, a show with a full date and a show with a
 * year only, a medley with a fragment, and one work with passages and a version.
 */
export async function seedSample(db: Db): Promise<void> {
  const need = async <T>(value: Promise<T | null>, what: string): Promise<T> => {
    const found = await value;
    if (!found) throw new Error(`Run seedLists first: ${what} is missing`);
    return found;
  };
  const setType = await need(db.setType.findUnique({ where: { name: "First set" } }), "set type");
  const encoreType = await need(db.setType.findUnique({ where: { name: "Encore" } }), "set type");
  const showType = await need(db.showType.findUnique({ where: { name: "Public performance" } }), "show type");
  const songKind = await need(db.workKind.findUnique({ where: { name: "song" } }), "work kind");
  const placeKind = await need(db.placeKind.findUnique({ where: { name: "hall" } }), "place kind");
  const words = await need(db.creditRole.findUnique({ where: { name: "words" } }), "credit role");
  const guitar = await need(db.instrument.findUnique({ where: { name: "guitar" } }), "instrument");

  const person = async (key: string, name: string) => {
    const id = await createEntity(db, "PERSON");
    return db.person.create({ data: { id, key, name } });
  };
  const alex = await person("sample-alex-rivers", "Alex Rivers");
  const sam = await person("sample-sam-ortega", "Sam Ortega");

  const bandId = await createEntity(db, "BAND");
  const band = await db.band.create({ data: { id: bandId, name: "The Sample Band", slug: "sample-band" } });
  const memberId = await createEntity(db, "LINEUP_ENTRY");
  const member = await db.lineupEntry.create({
    data: { id: memberId, bandId: band.id, personId: sam.id, dateYear: 1990, dateMonth: 3, sings: true },
  });
  await db.lineupInstrument.create({ data: { lineupEntryId: member.id, instrumentId: guitar.id } });

  const placeId = await createEntity(db, "PLACE");
  const place = await db.place.create({
    data: { id: placeId, placeKindId: placeKind.id, slug: "example-hall" },
  });
  const nameId = await createEntity(db, "PLACE_NAME");
  const placeName = await db.placeName.create({
    data: { id: nameId, placeId: place.id, name: "Example Hall", position: 1 },
  });

  const workId = await createEntity(db, "WORK");
  const work = await db.work.create({
    data: { id: workId, title: "Sample Song One", workKindId: songKind.id, slug: "sample-song-one" },
  });
  const passageIds: number[] = [];
  for (const [label, role] of [["Verse 1", "VERSE"], ["Chorus", "CHORUS"]] as const) {
    const id = await createEntity(db, "PASSAGE");
    await db.passage.create({ data: { id, workId: work.id, label, role } });
    passageIds.push(id);
  }
  const versionId = await createEntity(db, "VERSION");
  await db.version.create({ data: { id: versionId, workId: work.id, name: "Sample version" } });
  for (const [index, passageId] of passageIds.entries()) {
    const id = await createEntity(db, "VERSION_PASSAGE");
    await db.versionPassage.create({ data: { id, versionId, position: index + 1, passageId } });
  }
  const creditId = await createEntity(db, "CREDIT");
  await db.credit.create({
    data: { id: creditId, workId: work.id, personId: alex.id, roleId: words.id, kind: "ATTRIBUTED", certainty: "PROBABLE" },
  });
  const otherWorkId = await createEntity(db, "WORK");
  const otherWork = await db.work.create({
    data: { id: otherWorkId, title: "Sample Song Two", workKindId: songKind.id, slug: "sample-song-two" },
  });

  // A show with a full date, two sets and a medley that runs into a fragment.
  const showId = await createEntity(db, "SHOW");
  await db.show.create({
    data: {
      id: showId, dateYear: 1991, dateMonth: 6, dateDay: 14, bandId: band.id, showTypeId: showType.id,
      placeId: place.id, placeNameId: placeName.id, slug: "1991-06-14-example-hall",
    },
  });
  const addSet = async (position: number, setTypeId: number) => {
    const id = await createEntity(db, "SET");
    return db.set.create({ data: { id, showId, position, setTypeId } });
  };
  const first = await addSet(1, setType.id);
  await addSet(2, encoreType.id);
  const addSegment = async (setId: number, sortKey: string, data: Record<string, unknown>) => {
    const id = await createEntity(db, "SEGMENT");
    return db.segment.create({ data: { id, setId, sortKey, ...data } as never });
  };
  const opener = await addSegment(first.id, "a0", { workId: work.id, delivery: "SUNG", joinsNext: "RUNS_INTO" });
  await addSegment(first.id, "a1", {
    workId: otherWork.id, delivery: "SUNG", extent: "FRAGMENT", workCertainty: "PROBABLE",
  });
  const portionId = await createEntity(db, "PORTION_ENTRY");
  await db.portionEntry.create({ data: { id: portionId, segmentId: opener.id, position: 1, passageId: passageIds[1] } });

  // A show known only by its year: no month or day is stored.
  const yearOnlyId = await createEntity(db, "SHOW");
  await db.show.create({
    data: { id: yearOnlyId, dateYear: 1989, dateCertainty: "PROBABLE", dateAsWritten: "1989?", slug: "1989-sample" },
  });
}

/** Seed the lists, then the sample archive. */
export async function seed(db: Db): Promise<void> {
  await seedLists(db);
  await seedSample(db);
}
