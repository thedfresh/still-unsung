import type { Ctx } from "./context.ts";
import { bulk, newEntities, uniqueKey } from "./context.ts";
import { BILLED_AS, BILL_ACTS, BILL_OVERRIDES, FESTIVAL_EDITIONS, type BillAct, type BillRow } from "./name-fixes.ts";
import { normalizeName, num, slugify, str } from "./rules.ts";

// Data-model items 82 and 124: who else was on the bill moves out of the old billing text and
// notes into bill rows; festivals become one show group per edition, with their lineup as the
// group's bill. Runs after shows, bands and people exist.

/** An act's key in BILL_ACTS: normalized, without a leading "the", without a trailing period. */
export function actKey(text: string): string {
  return normalizeName(text).replace(/^the\s+/, "").replace(/[.\s]+$/, "");
}

/** The comment part of an old private note, where "Comfort opened for…" usually sits. */
function sentences(text: string): string[] {
  return text.split(/(?<=[.;)])\s+|\n+/).map((s) => s.replace(/^[(\s]+|[)\s]+$/g, "").trim()).filter(Boolean);
}

/**
 * The bill the old text describes, in bill order, or null when it describes none. Reads the
 * billing field first, then the notes (some shows have the words only in the notes):
 * - "Opened for X [and Y]": X (and Y) headline, the show's act opens.
 * - "Performed between X sets": X headlines, the show's act plays the set break.
 * - "performed between X and Y's sets": X and Y headline around the show's act (set break).
 * - "X [and Y] opened": the show's act headlines, X (and Y) open.
 */
export function readBill(billing: string | null, notes: string | null): BillRow[] | null {
  const texts = [billing, ...sentences(notes ?? "")].filter((t): t is string => !!t);
  // The most precise wording wins wherever it sits: the 2003 notes say "between Bob Dylan and The
  // Dead's sets" where the billing field only says "Opened for The Dead".
  for (const text of texts) {
    const around = /performed between (.+?) and (.+?)['’]s sets/i.exec(text);
    if (around) {
      return [
        { act: actKey(around[1]), role: "HEADLINER" },
        { act: "show", role: "SET_BREAK" },
        { act: actKey(around[2]), role: "HEADLINER" },
      ];
    }
  }
  for (const text of texts) {
    const between = /performed between (?:sets for )?(.+?)(?: sets)?$/i.exec(text);
    if (between) return [{ act: actKey(between[1]), role: "HEADLINER" }, { act: "show", role: "SET_BREAK" }];
    const opened = /\bopened for (.+?)(?:\s+at the\s+".*")?(?:[.(]|$)/i.exec(text);
    if (opened) {
      const heads = opened[1].split(/\s+and\s+/i).map(actKey);
      return [...heads.map((act) => ({ act, role: "HEADLINER" as const })), { act: "show", role: "OPENER" }];
    }
  }
  // "Peter Rowan opened", "James Montgomery and Peter Rowan opened": the show's act headlines.
  for (const text of texts) {
    const opener = /([A-Z][\w.'’&]*(?:\s+(?:&|and|[A-Z][\w.'’&]*))*)\s+opened\b(?!\s+for)/.exec(text);
    if (opener) {
      const acts = opener[1].replace(/^Comments:\s*/, "").split(/\s+and\s+/).map(actKey);
      // "The show opened with…" names no act.
      if (acts.includes("show")) continue;
      return [{ act: "show", role: "HEADLINER" }, ...acts.map((act) => ({ act, role: "OPENER" as const }))];
    }
  }
  return null;
}

/** Finds or makes the band or person for an act. */
async function actRecord(ctx: Ctx, act: BillAct, made: Map<string, { band?: number; person?: number }>): Promise<{ band?: number; person?: number }> {
  const key = `${act.kind}:${normalizeName(act.name)}`;
  const known = made.get(key);
  if (known) return known;
  let found: { band?: number; person?: number };
  if (act.kind === "band") {
    const band = await ctx.db.band.findFirst({ where: { name: { equals: act.name, mode: "insensitive" } }, select: { id: true } });
    if (band) found = { band: band.id };
    else {
      const [id] = await newEntities(ctx.db, "BAND", [true]);
      await ctx.db.band.create({ data: { id, name: act.name, isHunterBand: false, legacyId: "name-fixes:bill" } });
      ctx.line("Bands made for bills (name-fixes.ts)", `band ${id}: ${act.name}`);
      found = { band: id };
    }
  } else {
    const personId = ctx.personByName.get(normalizeName(act.name));
    if (personId !== undefined) found = { person: personId };
    else {
      const [id] = await newEntities(ctx.db, "PERSON", [true]);
      await ctx.db.person.create({ data: { id, name: act.name, key: uniqueKey(ctx, slugify(act.name)), legacyId: "name-fixes:bill" } });
      ctx.personByName.set(normalizeName(act.name), id);
      ctx.line("People made for bills (name-fixes.ts)", `person ${id}: ${act.name}`);
      found = { person: id };
    }
  }
  made.set(key, found);
  return found;
}

interface PendingBillRow {
  showId?: number;
  showGroupId?: number;
  band?: number;
  person?: number;
  role: BillRow["role"];
  position: number;
  certainty: "CONFIRMED" | "PROBABLE";
}

export async function importBills(ctx: Ctx): Promise<void> {
  const made = new Map<string, { band?: number; person?: number }>();
  const rows: PendingBillRow[] = [];
  const handled = new Set<number>();
  const hunterBand = (await ctx.db.band.findFirst({ where: { name: "Robert Hunter" }, select: { id: true } }))?.id;

  for (const [oldId, row] of ctx.eventRow) {
    const showId = ctx.showByEvent.get(oldId);
    if (showId === undefined) continue;
    const notes = [str(row, "public_notes"), str(row, "private_notes")].filter(Boolean).join("\n");
    const bill = BILL_OVERRIDES.get(oldId) ?? readBill(str(row, "billing"), notes);
    if (!bill) continue;
    const unknown = bill.filter((r) => r.act !== "show" && !BILL_ACTS.has(r.act));
    if (unknown.length > 0) {
      ctx.line("Bills with an act not on the reviewed list (no bill made)", `events:${oldId}: ${unknown.map((r) => r.act).join(", ")}`);
      continue;
    }
    // The show's own act: its band, or Robert Hunter.
    const ownBand = ctx.bandByBand.get(num(row, "primary_band_id") ?? -1) ?? hunterBand;
    // A set Hunter sat in on with the headliner itself (1980: the JGB's set, whose notes repeat
    // "Opened for the Jerry Garcia Band" from his own set that night) gets no bill.
    const heads = await Promise.all(bill.filter((r) => r.act !== "show").map((r) => actRecord(ctx, BILL_ACTS.get(r.act) as BillAct, made)));
    if (ownBand !== undefined && heads.some((h) => h.band === ownBand)) {
      ctx.line("Bills not made: the show's own band is on its bill (a sat-in set)", `events:${oldId}`);
      continue;
    }
    for (const [index, entry] of bill.entries()) {
      const act = entry.act === "show" ? (ownBand !== undefined ? { band: ownBand } : { person: ctx.fixedPerson.hunter }) : await actRecord(ctx, BILL_ACTS.get(entry.act) as BillAct, made);
      rows.push({ showId, ...act, role: entry.role, position: index + 1, certainty: "CONFIRMED" });
    }
    handled.add(showId);
    ctx.line("Bills made from the billing text and notes", `events:${oldId}: ${bill.map((r) => `${r.act} ${r.role.toLowerCase()}`).join(", ")}`);
  }

  // Festivals: one show group per edition, its shows as members, its lineup as the group's bill.
  const members: Array<{ groupId: number; showId: number }> = [];
  for (const [name, edition] of FESTIVAL_EDITIONS) {
    const [groupId] = await newEntities(ctx.db, "SHOW_GROUP", [true]);
    await ctx.db.showGroup.create({ data: { id: groupId, name, showGroupKindId: ctx.list.showGroupKind.get(edition.kind) as number, slug: slugify(name) } });
    ctx.line("Festival editions (name-fixes.ts)", `show group ${groupId}: ${name}`);
    for (const oldId of edition.events) {
      const showId = ctx.showByEvent.get(oldId);
      if (showId !== undefined) {
        members.push({ groupId, showId });
        handled.add(showId);
      }
    }
    for (const [index, key] of (edition.bill ?? []).entries()) {
      const act = await actRecord(ctx, BILL_ACTS.get(key) as BillAct, made);
      rows.push({ showGroupId: groupId, ...act, role: "CO_BILL", position: index + 1, certainty: edition.certainty ?? "CONFIRMED" });
    }
  }

  await bulk(ctx, "SHOW_GROUP_MEMBER", members, async (batch) => {
    await ctx.db.showGroupMember.createMany({ data: batch.map(({ item, id }) => ({ id, showGroupId: item.groupId, showId: item.showId })) });
  });
  await bulk(ctx, "BILL_ENTRY", rows, async (batch) => {
    await ctx.db.billEntry.createMany({
      data: batch.map(({ item, id }) => ({
        id,
        showId: item.showId ?? null,
        showGroupId: item.showGroupId ?? null,
        actBandId: item.band ?? null,
        actPersonId: item.person ?? null,
        role: item.role,
        position: item.position,
        certainty: item.certainty,
      })),
    });
  });

  // Billed-as names that only the notes give (from ads).
  for (const [oldId, billedAs] of BILLED_AS) {
    const showId = ctx.showByEvent.get(oldId);
    if (showId === undefined) continue;
    await ctx.db.show.update({ where: { id: showId }, data: { billedAs } });
    handled.add(showId);
    ctx.line("Billed-as names from the notes (name-fixes.ts)", `events:${oldId}: ${billedAs}`);
  }

  // The bill list keeps only the shows this step did not settle.
  const list = ctx.proposals.get("01-bill");
  if (list) {
    const left = list.filter((r) => !handled.has(Number(r.showId)));
    list.splice(0, list.length, ...left);
  }
}
