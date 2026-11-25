import type { EntityKind } from "@/generated/prisma/enums";
import type { Ctx } from "./context.ts";
import { LINK_SYSTEMS, bool, normalizeName, slugify, str } from "./rules.ts";

// Step 1 (plan section 3): the editable lists, the fixed people, the two accounts and the three
// Zotero sources. The names are generic terms; nothing here is production data. Instruments
// and any list value the old data uses but the plan does not name are read from the old copy.

const SET_TYPE_NAMES = [
  "Set", "Set 1", "Set 2", "Set 3", "Encore", "Encore 2", "Soundcheck",
  "Guest Appearance", "Studio Session", "Reading",
];
const SHOW_TYPE_NAMES = ["Public Performance", "Studio Session", "Broadcast", "Interview"];
const WORK_KINDS: Array<{ name: string; tickedByDefault: boolean }> = [
  { name: "song", tickedByDefault: true },
  { name: "instrumental", tickedByDefault: true },
  { name: "poem", tickedByDefault: false },
  { name: "suite", tickedByDefault: false },
  { name: "interview", tickedByDefault: false },
  { name: "journal entry", tickedByDefault: false },
  { name: "mailbag reply", tickedByDefault: false },
  { name: "essay", tickedByDefault: false },
  { name: "episode", tickedByDefault: false },
];
const CREDIT_ROLES = ["words", "music", "arrangement", "translation"];
const REFERENCE_KINDS: Array<{ name: string; ruleKey: string | null }> = [
  { name: "quotes", ruleKey: "quotes" },
  { name: "alludes to", ruleKey: null },
  { name: "draws on", ruleKey: null },
  { name: "mentions", ruleKey: null },
  { name: "part of", ruleKey: "part-of" },
  { name: "played on air", ruleKey: "played-on-air" },
  { name: "annotates", ruleKey: null },
  { name: "main subject", ruleKey: null },
];
const RECORDING_TYPE_NAMES = ["SBD", "FM", "Matrix", "Video", "Aud"];
const SHOW_GROUP_KINDS = ["festival", "tour", "run", "residency", "benefit series"];
const PLACE_KINDS = ["country", "region", "city", "campus", "park", "venue", "stage"];
const SOURCE_KINDS = [
  "album", "article", "book", "tape list", "ticket", "poster", "advertisement", "review", "website",
  "letter", "email", "image",
];
const SUBJECT_KINDS = ["theme", "place", "character", "song form", "event"];
const EVIDENCE_KINDS = ["studio", "live and lasting", "published text"];
const INCOMPLETE_REASONS = ["assumed", "inferred from the tape", "reported"];

/** The seeded set type an old set type name maps to, or null (a new type is then added). */
export function seededSetType(oldName: string): string | null {
  const name = normalizeName(oldName);
  if (name === "complete set" || name === "partial set") return "Set";
  if (name === "encore 1") return "Encore";
  return SET_TYPE_NAMES.find((seeded) => normalizeName(seeded) === name) ?? null;
}

export function seededShowType(oldName: string): string | null {
  const name = normalizeName(oldName);
  return SHOW_TYPE_NAMES.find((seeded) => normalizeName(seeded) === name) ?? null;
}

async function ensureNames(ctx: Ctx, names: string[], create: (rows: Array<{ name: string; position: number }>) => Promise<unknown>) {
  await create(names.map((name, position) => ({ name, position })));
}

export async function seedLists(ctx: Ctx): Promise<void> {
  const { db, list } = ctx;

  // Set types. The old row decides `includeInStats` where the names match; others are added.
  const oldSetTypes = await ctx.read("set_types");
  const stats = new Map<string, boolean>();
  const extraSetTypes: string[] = [];
  for (const row of oldSetTypes) {
    const seeded = seededSetType(str(row, "name") ?? "");
    if (seeded) stats.set(seeded, stats.get(seeded) !== false && bool(row, "include_in_stats"));
    else {
      // A type the seed list does not name keeps its own old include_in_stats value.
      const extra = str(row, "name") ?? `set type ${row.id}`;
      extraSetTypes.push(extra);
      stats.set(extra, bool(row, "include_in_stats"));
    }
  }
  const setTypeRows = [...SET_TYPE_NAMES, ...extraSetTypes].map((name, position) => ({
    name,
    displayName: name === "Set" ? "" : name,
    includeInStats: stats.get(name) ?? name !== "Soundcheck",
    position,
  }));
  await db.setType.createMany({ data: setTypeRows });
  for (const row of await db.setType.findMany()) list.setType.set(row.name, row.id);
  for (const row of oldSetTypes) {
    const old = str(row, "name") ?? `set type ${row.id}`;
    ctx.tally.mapped("set_types", row.id);
    if (extraSetTypes.includes(old)) ctx.line("Lists added from the old data", `set type from old set_types:${row.id}`);
  }

  // Show types, from the old event types. Errata is a status, not a type (plan, Show).
  const oldEventTypes = await ctx.read("event_types");
  const oldContentTypes = await ctx.read("content_types");
  const showStats = new Map<string, boolean>();
  const extraShowTypes: string[] = [];
  for (const row of oldEventTypes) {
    const name = str(row, "name") ?? "";
    if (normalizeName(name) === "errata") continue;
    const seeded = seededShowType(name);
    if (seeded) showStats.set(seeded, bool(row, "include_in_stats"));
    else {
      const extra = name || `event type ${row.id}`;
      extraShowTypes.push(extra);
      showStats.set(extra, bool(row, "include_in_stats"));
    }
  }
  await db.showType.createMany({
    data: [...SHOW_TYPE_NAMES, ...extraShowTypes].map((name, position) => ({
      name,
      includeInStats: showStats.get(name) ?? true,
      position,
    })),
  });
  for (const row of await db.showType.findMany()) list.showType.set(row.name, row.id);
  for (const row of oldEventTypes) {
    ctx.tally.mapped("event_types", row.id);
    const name = str(row, "name") ?? "";
    if (extraShowTypes.includes(name)) ctx.line("Lists added from the old data", `show type from old event_types:${row.id}`);
  }
  for (const row of oldContentTypes) ctx.tally.mapped("content_types", row.id);

  await db.workKind.createMany({ data: WORK_KINDS.map((kind, position) => ({ ...kind, position })) });
  for (const row of await db.workKind.findMany()) list.workKind.set(row.name, row.id);

  await ensureNames(ctx, CREDIT_ROLES, (data) => db.creditRole.createMany({ data }));
  for (const row of await db.creditRole.findMany()) list.creditRole.set(row.name, row.id);

  await db.referenceKind.createMany({ data: REFERENCE_KINDS.map((kind, position) => ({ ...kind, position })) });
  for (const row of await db.referenceKind.findMany()) list.referenceKind.set(row.name, row.id);

  await db.linkSystem.createMany({
    data: LINK_SYSTEMS.map((row, position) => ({
      name: row.system,
      purpose: row.purpose,
      urlTemplate: row.urlTemplate,
      position,
    })),
  });
  for (const row of await db.linkSystem.findMany()) list.linkSystem.set(row.name, row.id);
  for (const row of await ctx.read("link_types")) ctx.tally.mapped("link_types", row.id);

  // Recording types: the plan's list, plus any other old name. "Unknown" becomes no type.
  const oldRecordingTypes = await ctx.read("recording_types");
  const extraRecordingTypes: string[] = [];
  for (const row of oldRecordingTypes) {
    const name = str(row, "name") ?? "";
    const known = RECORDING_TYPE_NAMES.some((seeded) => normalizeName(seeded) === normalizeName(name));
    if (!known && normalizeName(name) !== "unknown") extraRecordingTypes.push(name || `recording type ${row.id}`);
    ctx.tally.mapped("recording_types", row.id);
  }
  await ensureNames(ctx, [...RECORDING_TYPE_NAMES, ...extraRecordingTypes], (data) => db.recordingType.createMany({ data }));
  for (const row of await db.recordingType.findMany()) list.recordingType.set(normalizeName(row.name), row.id);

  // Instruments: today's rows, read at run time.
  const oldInstruments = await ctx.read("instruments");
  const instrumentRows = oldInstruments.map((row, position) => ({
    name: str(row, "name") ?? `instrument ${row.id}`,
    displayName: str(row, "display_name") ?? str(row, "name") ?? `instrument ${row.id}`,
    position,
  }));
  await db.instrument.createMany({ data: instrumentRows, skipDuplicates: true });
  const instrumentByName = new Map((await db.instrument.findMany()).map((row) => [row.name, row.id]));
  oldInstruments.forEach((row, index) => {
    const id = instrumentByName.get(instrumentRows[index].name);
    if (id !== undefined) {
      ctx.instrumentByInstrument.set(Number(row.id), id);
      ctx.tally.mapped("instruments", row.id);
    }
  });

  await ensureNames(ctx, SHOW_GROUP_KINDS, (data) => db.showGroupKind.createMany({ data }));
  for (const row of await db.showGroupKind.findMany()) list.showGroupKind.set(row.name, row.id);
  await ensureNames(ctx, PLACE_KINDS, (data) => db.placeKind.createMany({ data }));
  for (const row of await db.placeKind.findMany()) list.placeKind.set(row.name, row.id);
  await ensureNames(ctx, SOURCE_KINDS, (data) => db.sourceKind.createMany({ data }));
  await ensureNames(ctx, SUBJECT_KINDS, (data) => db.subjectKind.createMany({ data }));
  await ensureNames(ctx, EVIDENCE_KINDS, (data) => db.evidenceKind.createMany({ data }));
  await ensureNames(ctx, INCOMPLETE_REASONS, (data) => db.incompleteReason.createMany({ data }));
}

async function createPerson(ctx: Ctx, key: string, name: string): Promise<number> {
  const entity = await ctx.db.entity.create({ data: { kind: "PERSON" satisfies EntityKind } });
  ctx.personKeys.add(key);
  await ctx.db.person.create({ data: { id: entity.id, key, name } });
  ctx.personByName.set(normalizeName(name), entity.id);
  return entity.id;
}

/** Robert Hunter, Audience, the curator and Claude (plan section 3). */
export async function seedFixedPeople(ctx: Ctx): Promise<void> {
  ctx.fixedPerson.hunter = await createPerson(ctx, "robert-hunter", "Robert Hunter");
  ctx.fixedPerson.audience = await createPerson(ctx, "audience", "Audience");
  ctx.fixedPerson.curator = await createPerson(ctx, "curator", "The curator");
  ctx.fixedPerson.claude = await createPerson(ctx, "claude", "Claude");
  // The two stand-in people are not old rows, so no name lookup may merge into them by accident.
  ctx.personByName.delete(normalizeName("The curator"));
  ctx.personByName.delete(normalizeName("Claude"));
}

/** The curator (ADMIN) and the agent (AGENT). Emails come from the settings only (item 89). */
export async function seedUsers(ctx: Ctx): Promise<void> {
  const { curatorEmail, agentEmail } = ctx.settings;
  if (curatorEmail) await ctx.db.user.create({ data: { name: "The curator", email: curatorEmail, role: "ADMIN" } });
  else ctx.line("Settings", "No curator email was given: no ADMIN user was made.");
  if (agentEmail) await ctx.db.user.create({ data: { name: "Claude", email: agentEmail, role: "AGENT" } });
  else ctx.line("Settings", "No agent email was given: no AGENT user was made.");
}

/** Until the Zotero sync exists, the three sources come from their keys (plan section 2). */
export async function seedSources(ctx: Ctx): Promise<void> {
  const { zotero } = ctx.settings;
  const sources = [
    { key: "legacy-setlist-list", zoteroKey: zotero.legacySetlistList, title: "Legacy setlist list" },
    { key: "gdsets", zoteroKey: zotero.gdsets, title: "GDSets" },
    { key: "whitegum", zoteroKey: zotero.whitegum, title: "Whitegum" },
  ];
  for (const source of sources) {
    const entity = await ctx.db.entity.create({ data: { kind: "SOURCE" } });
    await ctx.db.source.create({
      data: {
        id: entity.id,
        zoteroKey: source.zoteroKey,
        key: slugify(source.key),
        title: source.title,
        zoteroData: { madeBy: "legacy import", note: "Replaced by the Zotero sync." },
        syncedAt: new Date(),
      },
    });
    ctx.list.source.set(source.key, entity.id);
  }
}
