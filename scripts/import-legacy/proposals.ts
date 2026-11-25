import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PROPOSAL_NAMES, type Ctx, type ProposalRow } from "./context.ts";
import { normalizeName } from "./rules.ts";

// The 17 review lists of plan section 5. The script never applies them: it writes each one to a
// file outside the repository. They quote old notes, so they stay private.

/** Lists 6 and 7 come from the new data: names that match once spelling is ignored. */
export async function collectMergeProposals(ctx: Ctx): Promise<void> {
  const people = await ctx.db.person.findMany({
    where: { key: { notIn: ["robert-hunter", "audience", "curator", "claude"] } },
    select: { id: true, name: true, legacyId: true },
  });
  const byName = new Map<string, typeof people>();
  for (const person of people) byName.set(normalizeName(person.name), [...(byName.get(normalizeName(person.name)) ?? []), person]);
  for (const group of byName.values()) {
    if (group.length > 1) {
      ctx.propose("06-person-merges", {
        personIds: group.map((p) => p.id).join(","),
        legacyIds: group.map((p) => p.legacyId ?? "").join(","),
        name: group[0].name,
      });
    }
  }

  const names = await ctx.db.placeName.findMany({
    select: { placeId: true, name: true, place: { select: { parentId: true, placeKindId: true } } },
  });
  const squash = (text: string) => normalizeName(text).replace(/^the /, "").replace(/[^a-z0-9]/g, "");
  const groups = new Map<string, typeof names>();
  for (const row of names) {
    const key = `${row.place.placeKindId}|${row.place.parentId}|${squash(row.name)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  for (const group of groups.values()) {
    const places = new Set(group.map((row) => row.placeId));
    if (places.size > 1) {
      ctx.propose("07-place-merges", { placeIds: [...places].join(","), names: group.map((row) => row.name).join(" | ") });
    }
  }
}

export interface ProposalFile {
  name: string;
  rows: number;
  bytes: number;
}

export async function writeProposals(ctx: Ctx, outputDir: string): Promise<ProposalFile[]> {
  const dir = path.join(outputDir, "proposals");
  await mkdir(dir, { recursive: true });
  const files: ProposalFile[] = [];
  for (const name of PROPOSAL_NAMES) {
    const rows: ProposalRow[] = ctx.proposals.get(name) ?? [];
    const text = `${JSON.stringify({ proposal: name, applied: false, rows }, null, 1)}\n`;
    await writeFile(path.join(dir, `${name}.json`), text);
    files.push({ name, rows: rows.length, bytes: Buffer.byteLength(text) });
  }
  return files;
}
