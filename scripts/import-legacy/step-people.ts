import { bulk, newEntities, uniqueKey, type Ctx } from "./context.ts";
import { bool, dateOf, dateParts, isUnknownName, normalizeName, num, slugify, str, type Row } from "./rules.ts";

// Steps 2: people, bands and places (plan section 4: Musician and Contributor, Band and
// BandMusician, Venue).

interface NewPerson {
  legacyId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  slug: string | null;
  email: string | null;
  oldId: number;
  table: "musicians" | "contributors";
  isPublic: boolean;
}

async function writePeople(ctx: Ctx, people: NewPerson[], usedSlugs: Set<string>) {
  const rows = people.map((person) => {
    const key = uniqueKey(ctx, slugify(person.name));
    const slug = person.slug !== null && !usedSlugs.has(person.slug) ? person.slug : null;
    if (person.slug !== null && slug === null) {
      ctx.line("Person slugs", `${person.table}:${person.oldId} kept no slug: the old slug was already taken`);
    }
    if (slug !== null) usedSlugs.add(slug);
    if (key !== slugify(person.name)) ctx.line("Person key suffixes", `${person.table}:${person.oldId} got the key suffix of "${key.slice(slugify(person.name).length)}"`);
    return { person, key, slug };
  });
  const ids = await bulk(ctx, "PERSON", rows, async (batch) => {
    await ctx.db.person.createMany({
      data: batch.map(({ item, id }) => ({
        id,
        key: item.key,
        name: item.person.name,
        firstName: item.person.firstName,
        lastName: item.person.lastName,
        email: item.person.email,
        slug: item.slug,
        legacyId: item.person.legacyId,
      })),
    });
  });
  return ids;
}

export async function importPeople(ctx: Ctx): Promise<void> {
  const usedSlugs = new Set<string>();
  const musicians = await ctx.read("musicians");
  const toMake: NewPerson[] = [];
  for (const row of musicians) {
    const id = Number(row.id);
    const name = str(row, "name") ?? `Musician ${id}`;
    if (isUnknownName(name)) {
      // Item 33: an "Unknown" singer or player is no person: the entry has no person.
      ctx.personByMusician.set(id, null);
      ctx.tally.drop("musicians", id, "unknown-musician-becomes-no-person (item 33)");
      continue;
    }
    const normalized = normalizeName(name);
    if (normalized === "robert hunter" || normalized === "audience") {
      const fixed = normalized === "audience" ? ctx.fixedPerson.audience : ctx.fixedPerson.hunter;
      ctx.personByMusician.set(id, fixed);
      await ctx.db.person.update({ where: { id: fixed }, data: { legacyId: `musicians:${id}` } });
      ctx.tally.mapped("musicians", id);
      ctx.line("Musicians that are fixed people", `musicians:${id} is the fixed person ${normalized === "audience" ? "Audience" : "Robert Hunter"}`);
      continue;
    }
    toMake.push({
      legacyId: `musicians:${id}`,
      name,
      firstName: str(row, "first_name"),
      lastName: str(row, "last_name"),
      slug: str(row, "slug"),
      email: null,
      oldId: id,
      table: "musicians",
      isPublic: true,
    });
  }
  const musicianIds = await writePeople(ctx, toMake, usedSlugs);
  toMake.forEach((person, index) => {
    ctx.personByMusician.set(person.oldId, musicianIds[index]);
    if (!ctx.personByName.has(normalizeName(person.name))) ctx.personByName.set(normalizeName(person.name), musicianIds[index]);
    ctx.tally.mapped("musicians", person.oldId);
  });
  const musicianRows = new Map(musicians.map((row) => [Number(row.id), row]));
  for (const [oldId, personId] of ctx.personByMusician) {
    const row = musicianRows.get(oldId);
    if (personId === null || !row) continue;
    ctx.note(personId, str(row, "public_notes"), true, `musicians:${oldId}:publicNotes`);
    ctx.note(personId, str(row, "private_notes"), false, `musicians:${oldId}:privateNotes`);
    const slug = str(row, "slug");
    if (slug) ctx.addresses.push({ path: `/musician/${slug}`, entityId: personId, slug });
  }

  // Contributors: one person each, never merged with a musician of the same name.
  const contributors = await ctx.read("contributors");
  const contributorPeople: NewPerson[] = contributors.map((row) => ({
    legacyId: `contributors:${row.id}`,
    name: str(row, "name") ?? `Contributor ${row.id}`,
    firstName: null,
    lastName: null,
    slug: str(row, "slug"),
    email: str(row, "email"),
    oldId: Number(row.id),
    table: "contributors",
    isPublic: true,
  }));
  const contributorIds = await writePeople(ctx, contributorPeople, usedSlugs);
  contributorPeople.forEach((person, index) => {
    ctx.personByContributor.set(person.oldId, contributorIds[index]);
    const normalized = normalizeName(person.name);
    if (!ctx.contributorByName.has(normalized)) ctx.contributorByName.set(normalized, contributorIds[index]);
    ctx.tally.mapped("contributors", person.oldId);
  });
  for (const row of contributors) {
    const personId = ctx.personByContributor.get(Number(row.id));
    if (personId === undefined) continue;
    ctx.note(personId, str(row, "public_notes"), true, `contributors:${row.id}:publicNotes`);
    ctx.note(personId, str(row, "private_notes"), false, `contributors:${row.id}:privateNotes`);
  }

  await importDefaultInstruments(ctx, musicians);
}

async function importDefaultInstruments(ctx: Ctx, musicians: Row[]): Promise<void> {
  const pairs = new Set<string>();
  const data: Array<{ personId: number; instrumentId: number }> = [];
  const add = (musicianId: number | null, instrumentId: number | null) => {
    if (musicianId === null || instrumentId === null) return;
    const personId = ctx.personByMusician.get(musicianId);
    const mapped = ctx.instrumentByInstrument.get(instrumentId);
    if (!personId || mapped === undefined) return;
    const key = `${personId}:${mapped}`;
    if (pairs.has(key)) return;
    pairs.add(key);
    data.push({ personId, instrumentId: mapped });
  };
  for (const row of musicians) add(Number(row.id), num(row, "default_instrument_id"));
  const defaults = await ctx.read("musician_default_instruments");
  for (const row of defaults) {
    add(num(row, "musician_id"), num(row, "instrument_id"));
    ctx.tally.mapped("musician_default_instruments", row.id);
  }
  await ctx.db.personInstrument.createMany({ data });
}

export async function importBands(ctx: Ctx): Promise<void> {
  const bands = await ctx.read("bands");
  const ids = await bulk(ctx, "BAND", bands, async (batch) => {
    await ctx.db.band.createMany({
      data: batch.map(({ item, id }) => ({
        id,
        name: str(item, "name") ?? `Band ${item.id}`,
        displayName: str(item, "display_name"),
        isHunterBand: item.is_hunter_band === undefined ? true : bool(item, "is_hunter_band"),
        slug: str(item, "slug"),
        legacyId: `bands:${item.id}`,
      })),
    });
  });
  bands.forEach((row, index) => {
    ctx.bandByBand.set(Number(row.id), ids[index]);
    ctx.tally.mapped("bands", row.id);
    ctx.note(ids[index], str(row, "public_notes"), true, `bands:${row.id}:publicNotes`);
    ctx.note(ids[index], str(row, "private_notes"), false, `bands:${row.id}:privateNotes`);
    const slug = str(row, "slug");
    if (slug) ctx.addresses.push({ path: `/band/${slug}`, entityId: ids[index], slug });
  });

  // Band members: a lineup entry at band level, with the dates of joining and leaving.
  const members = await ctx.read("band_musicians");
  const memberInstruments = await ctx.read("band_musician_instruments");
  const usable = members.filter((row) => {
    const personId = ctx.personByMusician.get(num(row, "musician_id") ?? -1);
    const bandId = ctx.bandByBand.get(num(row, "band_id") ?? -1);
    if (!personId || !bandId) {
      ctx.tally.notMapped("band_musicians", row.id, personId === null ? "member is the unknown musician" : "band or musician missing");
      return false;
    }
    return true;
  });
  const lineupIds = await bulk(ctx, "LINEUP_ENTRY", usable, async (batch) => {
    await ctx.db.lineupEntry.createMany({
      data: batch.map(({ item, id }) => {
        const start = dateParts(dateOf(item, "joined_date"));
        const end = dateParts(dateOf(item, "left_date"));
        return {
          id,
          bandId: ctx.bandByBand.get(Number(item.band_id)) as number,
          personId: ctx.personByMusician.get(Number(item.musician_id)) as number,
          dateYear: start.year,
          dateMonth: start.month,
          dateDay: start.day,
          dateEndYear: end.year,
          dateEndMonth: end.month,
          dateEndDay: end.day,
          legacyId: `band_musicians:${item.id}`,
        };
      }),
    });
  });
  usable.forEach((row, index) => {
    ctx.lineupByBandMusician.set(Number(row.id), lineupIds[index]);
    ctx.tally.mapped("band_musicians", row.id);
    ctx.note(lineupIds[index], str(row, "public_notes"), true, `band_musicians:${row.id}:publicNotes`);
    ctx.note(lineupIds[index], str(row, "private_notes"), false, `band_musicians:${row.id}:privateNotes`);
  });
  await writeInstruments(ctx, memberInstruments, "band_musician_id", ctx.lineupByBandMusician, "band_musician_instruments");
}

/** Write LineupInstrument rows from an old "…_instruments" table. Unique pairs only. */
export async function writeInstruments(
  ctx: Ctx,
  rows: Row[],
  ownerField: string,
  owners: Map<number, number>,
  table: string,
  extra: Array<{ lineupEntryId: number; instrumentId: number }> = [],
): Promise<void> {
  const seen = new Set<string>();
  const data: Array<{ lineupEntryId: number; instrumentId: number }> = [];
  const add = (lineupEntryId: number | undefined, instrumentId: number | undefined) => {
    if (lineupEntryId === undefined || instrumentId === undefined) return false;
    const key = `${lineupEntryId}:${instrumentId}`;
    if (seen.has(key)) return true;
    seen.add(key);
    data.push({ lineupEntryId, instrumentId });
    return true;
  };
  for (const row of rows) {
    const ok = add(owners.get(Number(row[ownerField])), ctx.instrumentByInstrument.get(Number(row.instrument_id)));
    if (ok) ctx.tally.mapped(table, row.id);
    else ctx.tally.notMapped(table, row.id, "entry or instrument was not migrated");
  }
  for (const item of extra) add(item.lineupEntryId, item.instrumentId);
  await ctx.db.lineupInstrument.createMany({ data });
}

// ---------------------------------------------------------------------------------------------
// Places (item 36)

interface PlaceInput {
  kind: string | null;
  name: string;
  parentId: number | null;
  slug: string | null;
  legacyId: string;
}

async function makePlace(ctx: Ctx, input: PlaceInput, isPublic = true): Promise<{ placeId: number; nameId: number }> {
  const [placeId, nameId] = await newEntities(ctx.db, "PLACE", [isPublic]).then(async ([place]) => {
    const [name] = await newEntities(ctx.db, "PLACE_NAME", [isPublic]);
    return [place, name];
  });
  await ctx.db.place.create({
    data: {
      id: placeId,
      placeKindId: input.kind === null ? null : (ctx.list.placeKind.get(input.kind) ?? null),
      parentId: input.parentId,
      slug: input.slug,
      legacyId: input.legacyId,
    },
  });
  await ctx.db.placeName.create({
    data: { id: nameId, placeId, name: input.name, position: 1, legacyId: input.legacyId },
  });
  return { placeId, nameId };
}

export async function importPlaces(ctx: Ctx): Promise<void> {
  const venues = await ctx.read("venues");
  const shared = new Map<string, number>();
  const usedSlugs = new Set<string>();

  const ensure = async (kind: string | null, name: string, parentId: number | null, legacyId: string) => {
    const key = `${kind}|${parentId ?? 0}|${normalizeName(name)}`;
    const found = shared.get(key);
    if (found !== undefined) return found;
    const made = await makePlace(ctx, { kind, name, parentId, slug: null, legacyId });
    shared.set(key, made.placeId);
    ctx.line("Places made from text", `place ${made.placeId} (${kind ?? "no kind"}) from ${legacyId}`);
    return made.placeId;
  };

  for (const row of venues) {
    const id = Number(row.id);
    let parent: number | null = null;
    const country = str(row, "country");
    const region = str(row, "state_province");
    const city = str(row, "city");
    const context = str(row, "context");
    if (country) parent = await ensure("country", country, parent, `venues:${id}:country`);
    if (region) parent = await ensure("region", region, parent, `venues:${id}:stateProvince`);
    if (city) parent = await ensure("city", city, parent, `venues:${id}:city`);
    // The context (a campus, a park, a hotel) becomes a parent place with no kind. Whether it
    // is a campus or a festival is the curator's call (plan section 4, Venue).
    if (context) parent = await ensure(null, context, parent, `venues:${id}:context`);
    const slug = str(row, "slug");
    const venueSlug = slug !== null && !usedSlugs.has(slug) ? slug : null;
    if (venueSlug) usedSlugs.add(venueSlug);
    const made = await makePlace(ctx, {
      kind: "venue",
      name: str(row, "name") ?? `Venue ${id}`,
      parentId: parent,
      slug: venueSlug,
      legacyId: `venues:${id}`,
    });
    ctx.placeByVenue.set(id, made);
    ctx.tally.mapped("venues", id);
    ctx.note(made.placeId, str(row, "public_notes"), true, `venues:${id}:publicNotes`);
    ctx.note(made.placeId, str(row, "private_notes"), false, `venues:${id}:privateNotes`);
    if (slug) ctx.addresses.push({ path: `/venue/${slug}`, entityId: made.placeId, slug });
    if (context) ctx.line("Venue contexts", `venues:${id} has a context: made a parent place with no kind`);
  }
}
