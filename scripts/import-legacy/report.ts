import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Ctx } from "./context.ts";
import type { ProposalFile } from "./proposals.ts";
import type { StressResult } from "./stress.ts";

// The verification report (plan section 7). Ids and counts only: no banter text, emails or raw
// entries, so it may be attached to Jira.

/** Where each old table goes (plan section 4). */
export const TABLE_MAP: Record<string, string> = {
  events: "shows (+ citations, external_ids, notes)",
  sets: "sets",
  performances: "segments (+ vocal_entries, lineup_entries)",
  show_banter: "segments (spoken)",
  songs: "works (+ credits, work_singers, notes)",
  musicians: "people",
  contributors: "people",
  bands: "bands",
  band_musicians: "lineup_entries (band level)",
  venues: "places, place_names",
  recordings: "recordings, external_ids",
  event_contributors: "citations",
  links: "external_ids, citations",
  tags: "references (suites)",
  song_tags: "references (suites)",
  albums: "listed: Zotero items first (item 34)",
  song_albums: "listed: Zotero items first (item 34)",
  event_musicians: "lineup_entries (show level)",
  set_musicians: "lineup_entries (set level)",
  performance_musicians: "lineup_entries (segment level)",
  performance_vocalists: "vocal_entries",
  song_vocalists: "work_singers",
  musician_default_instruments: "person_instruments",
  instruments: "instruments",
  band_musician_instruments: "lineup_instruments",
  event_musician_instruments: "lineup_instruments",
  set_musician_instruments: "lineup_instruments",
  performance_musician_instruments: "lineup_instruments",
  event_types: "show_types",
  content_types: "show_types / status",
  set_types: "set_types",
  recording_types: "recording_types",
  link_types: "link_systems",
  rss_entries: "not migrated (item 20)",
  data_migrations: "not migrated (system table)",
};

const IDS_SHOWN = 40;

function ids(list: number[]): string {
  const shown = list.slice(0, IDS_SHOWN).join(", ");
  return list.length > IDS_SHOWN ? `${shown}, … (${list.length} in all; the JSON report lists every id)` : shown;
}

async function newCounts(ctx: Ctx): Promise<Array<{ table: string; rows: number }>> {
  const tables = await ctx.db.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> '_prisma_migrations'
    ORDER BY table_name`;
  const out: Array<{ table: string; rows: number }> = [];
  for (const { table_name: table } of tables) {
    if (!/^[a-z_]+$/.test(table)) continue;
    const [row] = await ctx.db.$queryRawUnsafe<Array<{ n: number }>>(`SELECT count(*)::int AS n FROM "${table}"`);
    out.push({ table, rows: row.n });
  }
  return out;
}

export interface ReportInput {
  startedAt: Date;
  proposalFiles: ProposalFile[];
  stress: StressResult[];
}

export async function writeReport(ctx: Ctx, outputDir: string, input: ReportInput): Promise<{ markdown: string; unaccounted: number }> {
  const counts = await newCounts(ctx);
  const md: string[] = [];
  const json: Record<string, unknown> = { startedAt: input.startedAt.toISOString() };

  md.push("# Legacy import: verification report", "", `Run started ${input.startedAt.toISOString()}. Ids and counts only.`, "");

  // Row counts and the "nothing lost" ledger (test 7).
  md.push("## Old tables: every row accounted for", "", "| old table | rows | mapped | dropped by a rule | listed as not mapped | unaccounted | goes to |", "|---|---:|---:|---:|---:|---:|---|");
  let unaccounted = 0;
  const ledger: Record<string, unknown> = {};
  for (const table of ctx.tally.tablesSeen()) {
    const s = ctx.tally.summary(table);
    unaccounted += s.unaccounted.length;
    md.push(`| ${table} | ${s.total} | ${s.mapped} | ${s.dropped} | ${s.unmapped} | ${s.unaccounted.length} | ${TABLE_MAP[table] ?? ""} |`);
    ledger[table] = { ...s, dropped: Object.fromEntries(ctx.tally.dropped.get(table) ?? []), unmapped: Object.fromEntries(ctx.tally.unmapped.get(table) ?? []) };
  }
  md.push("", unaccounted === 0 ? "Every old row is mapped, dropped by a named rule, or listed below." : `**${unaccounted} old rows are unaccounted for.** They are listed below.`, "");
  const absent = ctx.legacy.tables();
  md.push(`Old tables found in the copy: ${absent.length}. A table the plan names but the copy lacks is read as empty.`, "");

  md.push("## Rows dropped by a named rule", "");
  for (const table of ctx.tally.tablesSeen()) {
    for (const [rule, list] of ctx.tally.dropped.get(table) ?? []) md.push(`- ${table}: ${rule}: ${list.length} rows (${ids(list)})`);
  }
  for (const [rule, n] of ctx.fieldDrops) md.push(`- field ${rule}: ${n} values`);
  md.push("", "## Rows that did not map, with the reason", "");
  for (const table of ctx.tally.tablesSeen()) {
    for (const [reason, list] of ctx.tally.unmapped.get(table) ?? []) md.push(`- ${table}: ${reason}: ${list.length} rows (${ids(list)})`);
    const s = ctx.tally.summary(table);
    if (s.unaccounted.length > 0) md.push(`- ${table}: NOT ACCOUNTED FOR: ${ids(s.unaccounted)}`);
  }

  md.push("", "## New tables: row counts", "", "| new table | rows |", "|---|---:|", ...counts.map((c) => `| ${c.table} | ${c.rows} |`), "");

  md.push("## Notes from the steps", "");
  const bySection = new Map<string, string[]>();
  for (const line of ctx.lines) bySection.set(line.section, [...(bySection.get(line.section) ?? []), line.text]);
  for (const [section, lines] of bySection) {
    md.push(`### ${section} (${lines.length})`, "");
    for (const text of lines.slice(0, 200)) md.push(`- ${text}`);
    if (lines.length > 200) md.push(`- … ${lines.length - 200} more in the JSON report`);
    md.push("");
  }

  md.push("## Stress tests (plan section 6)", "");
  for (const test of input.stress) {
    md.push(`### ${test.title}`, "", test.summary, "");
    if (test.lines.length > 0) md.push("```", ...test.lines.slice(0, 300), test.lines.length > 300 ? `… ${test.lines.length - 300} more in the JSON report` : "", "```", "");
  }
  md.push("### 7. Nothing lost", "", unaccounted === 0 ? "Passed: see the table at the top." : `Failed: ${unaccounted} rows unaccounted for.`, "");

  md.push("## Proposal files (not applied)", "", "| file | rows | bytes |", "|---|---:|---:|", ...input.proposalFiles.map((f) => `| ${f.name}.json | ${f.rows} | ${f.bytes} |`), "");

  json.ledger = ledger;
  json.newCounts = counts;
  json.notes = Object.fromEntries(bySection);
  json.fieldDrops = Object.fromEntries(ctx.fieldDrops);
  json.stress = input.stress;
  json.proposalFiles = input.proposalFiles;
  json.unaccounted = unaccounted;

  const markdown = md.join("\n");
  await mkdir(outputDir, { recursive: true });
  await writeFile(path.join(outputDir, "report.md"), `${markdown}\n`);
  await writeFile(path.join(outputDir, "report.json"), `${JSON.stringify(json, null, 1)}\n`);
  return { markdown, unaccounted };
}
