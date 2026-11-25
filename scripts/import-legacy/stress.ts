import type { Ctx } from "./context.ts";
import { bool, dateOf, normalizeName, num, str, type Row } from "./rules.ts";

// The stress tests of plan section 6. Each one compares the new data with the old rows and
// lists the differences by id. No banter text, emails or raw entries (plan section 7).

export interface StressResult {
  title: string;
  summary: string;
  lines: string[];
}

type Resolved = string;

/** Test 1 (item 33): the lead singer of every segment, new rule against today's site. */
async function leadSingers(ctx: Ctx): Promise<StressResult> {
  const segments = await ctx.db.segment.findMany({
    where: { workId: { not: null }, OR: [{ delivery: null }, { delivery: { not: "SPOKEN" } }] },
    select: { id: true, workId: true, legacyId: true, set: { select: { show: { select: { bandId: true } } } } },
  });
  const entries = await ctx.db.vocalEntry.findMany({ where: { role: "LEAD" }, select: { segmentId: true, personId: true } });
  const singers = await ctx.db.workSinger.findMany({ select: { workId: true, bandId: true, personId: true } });
  const leadBySegment = new Map<number, Set<Resolved>>();
  for (const entry of entries) leadBySegment.set(entry.segmentId, (leadBySegment.get(entry.segmentId) ?? new Set()).add(String(entry.personId)));
  const singersByWork = new Map<number, typeof singers>();
  for (const row of singers) singersByWork.set(row.workId, [...(singersByWork.get(row.workId) ?? []), row]);
  const hunter = String(ctx.fixedPerson.hunter);

  const newSingers = (segment: (typeof segments)[number]): Set<Resolved> => {
    const own = leadBySegment.get(segment.id);
    if (own) return own;
    const defaults = singersByWork.get(segment.workId as number) ?? [];
    const forBand = defaults.filter((row) => row.bandId !== null && row.bandId === segment.set.show.bandId);
    const chosen = forBand.length > 0 ? forBand : defaults.filter((row) => row.bandId === null);
    return chosen.length > 0 ? new Set(chosen.map((row) => String(row.personId))) : new Set([hunter]);
  };

  const performances = new Map((await ctx.read("performances")).map((row) => [Number(row.id), row]));
  const songs = new Map((await ctx.read("songs")).map((row) => [Number(row.id), row]));
  const performanceVocals = groupBy(await ctx.read("performance_vocalists"), "performance_id");
  const songVocals = groupBy(await ctx.read("song_vocalists"), "song_id");
  const person = (musicianId: number | null): string =>
    musicianId === null ? "null" : String(ctx.personByMusician.get(musicianId) ?? "null");

  const oldSingers = (performance: Row): Set<Resolved> => {
    const lead = num(performance, "lead_vocals_id");
    const own = new Set<Resolved>();
    if (lead !== null) own.add(person(lead));
    for (const row of performanceVocals.get(Number(performance.id)) ?? []) {
      if (/lead|^$/i.test(str(row, "vocal_role") ?? "")) own.add(person(num(row, "musician_id")));
    }
    if (own.size > 0) return own;
    const song = songs.get(Number(performance.song_id));
    const fromSong = new Set<Resolved>();
    if (song && num(song, "lead_vocals_id") !== null) fromSong.add(person(num(song, "lead_vocals_id")));
    for (const row of songVocals.get(Number(performance.song_id)) ?? []) fromSong.add(person(num(row, "musician_id")));
    return fromSong.size > 0 ? fromSong : new Set([hunter]);
  };

  const different: string[] = [];
  for (const segment of segments) {
    const match = /^performances:(\d+)$/.exec(segment.legacyId ?? "");
    const performance = match ? performances.get(Number(match[1])) : undefined;
    if (!performance) continue;
    const a = [...newSingers(segment)].sort().join(",");
    const b = [...oldSingers(performance)].sort().join(",");
    if (a !== b) different.push(`segment ${segment.id} (${segment.legacyId}): new [${a}] old [${b}]`);
  }
  return {
    title: "1. Lead singer (item 33)",
    summary: `${segments.length} segments compared; ${different.length} differ.`,
    lines: different,
  };
}

function groupBy(rows: Row[], field: string): Map<number, Row[]> {
  const out = new Map<number, Row[]>();
  for (const row of rows) out.set(Number(row[field]), [...(out.get(Number(row[field])) ?? []), row]);
  return out;
}

/** Test 2 (item 35): every suite performance, in the explicit view and in the compact view. */
async function suites(ctx: Ctx): Promise<StressResult> {
  const suiteWorks = await ctx.db.work.findMany({ where: { workKind: { name: "suite" } }, select: { id: true, suiteStructure: true } });
  const lines: string[] = [];
  let performances = 0;
  for (const suite of suiteWorks) {
    const parts = await ctx.db.reference.findMany({ where: { toId: suite.id, referenceKind: { ruleKey: "part-of" } }, select: { fromId: true } });
    const memberIds = new Set(parts.map((row) => row.fromId));
    const inherited = suite.suiteStructure === "FIXED" ? "0 inherited parts until the suite parts are proposed and applied" : "variable";
    lines.push(`suite work ${suite.id} (${suite.suiteStructure}): ${memberIds.size} member works, ${inherited}`);
    const segments = await ctx.db.segment.findMany({
      where: { workId: { in: [...memberIds] } },
      orderBy: [{ set: { showId: "asc" } }, { set: { position: "asc" } }, { sortKey: "asc" }],
      select: { id: true, workId: true, setId: true, set: { select: { showId: true } } },
    });
    performances += segments.length;
    // Explicit view: one line for each performance of a member work.
    for (const segment of segments) {
      lines.push(`  explicit: show ${segment.set.showId} set ${segment.setId} segment ${segment.id} work ${segment.workId}`);
    }
    // Compact view: each set that holds the suite's members shows once, with its segment count.
    const bySet = new Map<number, number[]>();
    for (const segment of segments) bySet.set(segment.setId, [...(bySet.get(segment.setId) ?? []), segment.id]);
    for (const [setId, ids] of bySet) {
      lines.push(`  compact: suite ${suite.id} in set ${setId}: ${ids.length} segment(s) (${ids.join(", ")})`);
    }
  }
  return { title: "2. Suites (item 35)", summary: `${suiteWorks.length} suites made; ${performances} suite performances printed in both views.`, lines };
}

/** Test 3 (item 36): the place chain of every show, against the old venue text. */
async function places(ctx: Ctx): Promise<{ result: StressResult; chains: string[] }> {
  const all = await ctx.db.place.findMany({
    select: { id: true, parentId: true, placeKind: { select: { name: true } }, names: { select: { name: true }, orderBy: { position: "desc" }, take: 1 } },
  });
  const byId = new Map(all.map((place) => [place.id, place]));
  const chainOf = (placeId: number) => {
    const out: Array<{ id: number; kind: string | null; name: string }> = [];
    for (let at: number | null = placeId; at !== null; at = byId.get(at)?.parentId ?? null) {
      const place = byId.get(at);
      if (!place) break;
      out.push({ id: place.id, kind: place.placeKind?.name ?? null, name: place.names[0]?.name ?? "" });
    }
    return out;
  };
  const venues = new Map((await ctx.read("venues")).map((row) => [Number(row.id), row]));
  const shows = await ctx.db.show.findMany({ where: { placeId: { not: null } }, select: { id: true, placeId: true, legacyId: true } });
  const oldVenueOfEvent = new Map((await ctx.read("events")).map((row) => [`events:${row.id}`, num(row, "venue_id")]));
  const chains: string[] = [];
  const changed: string[] = [];
  for (const show of shows) {
    const chain = chainOf(show.placeId as number);
    chains.push(`${show.id}\t${show.legacyId}\t${chain.map((c) => c.id).join(">")}`);
    const venue = venues.get(oldVenueOfEvent.get(show.legacyId ?? "") ?? -1);
    if (!venue) continue;
    for (const [kind, field] of [["city", "city"], ["country", "country"]] as const) {
      const old = str(venue, field);
      const found = chain.find((c) => c.kind === kind)?.name ?? null;
      if ((old === null) !== (found === null) || (old !== null && found !== null && normalizeName(old) !== normalizeName(found))) {
        changed.push(`show ${show.id} (${show.legacyId}): ${kind} changed`);
      }
    }
  }
  return {
    result: {
      title: "3. Places (item 36)",
      summary: `${shows.length} show chains written to place-chains.tsv; ${changed.length} city or country differences.`,
      lines: changed,
    },
    chains,
  };
}

/** Test 4 (item 80): old "times played" against the new default count, with the reasons. */
async function counts(ctx: Ctx): Promise<StressResult> {
  const segments = await ctx.db.segment.findMany({
    where: { workId: { not: null } },
    select: {
      workId: true,
      delivery: true,
      extent: true,
      legacyId: true,
      set: { select: { setType: { select: { includeInStats: true } }, show: { select: { status: true, showType: { select: { includeInStats: true } } } } } },
    },
  });
  const perWork = new Map<number, { counted: number; fragment: number; setType: number; showType: number; spurious: number; total: number }>();
  for (const segment of segments) {
    if (!segment.legacyId?.startsWith("performances:")) continue;
    const row = perWork.get(segment.workId as number) ?? { counted: 0, fragment: 0, setType: 0, showType: 0, spurious: 0, total: 0 };
    row.total += 1;
    const fragment = segment.extent === "FRAGMENT" || segment.extent === "ABORTED";
    const setType = !segment.set.setType.includeInStats;
    const showType = segment.set.show.showType ? !segment.set.show.showType.includeInStats : false;
    const spurious = segment.set.show.status !== "TOOK_PLACE";
    if (fragment) row.fragment += 1;
    if (setType) row.setType += 1;
    if (showType) row.showType += 1;
    if (spurious) row.spurious += 1;
    if (!fragment && !setType && !showType && !spurious) row.counted += 1;
    perWork.set(segment.workId as number, row);
  }
  const lines: string[] = [];
  const oldCounts = new Map<number, number>();
  for (const row of await ctx.read("performances")) {
    if (ctx.segmentByPerformance.has(Number(row.id))) oldCounts.set(Number(row.song_id), (oldCounts.get(Number(row.song_id)) ?? 0) + 1);
  }
  for (const [songId, old] of oldCounts) {
    const workId = ctx.workBySong.get(songId) as number;
    const row = perWork.get(workId);
    const counted = row?.counted ?? 0;
    if (counted === old) continue;
    const explained = row ? row.fragment + row.setType + row.showType + row.spurious : 0;
    lines.push(
      `work ${workId} (songs:${songId}): old ${old}, new ${counted}; fragments or aborted ${row?.fragment ?? 0}, set type not counted ${row?.setType ?? 0}, show type not counted ${row?.showType ?? 0}, spurious show ${row?.spurious ?? 0}${explained === 0 ? " (unexplained)" : ""}`,
    );
  }
  return { title: "4. Counts (item 80)", summary: `${oldCounts.size} songs compared; ${lines.length} differ.`, lines };
}

/** The longest run of segments joined by RUNS_INTO in one set: the "complicated set" of plan section 8. */
async function longestMedleyShow(ctx: Ctx): Promise<number | null> {
  const segments = await ctx.db.segment.findMany({
    where: { workId: { not: null } },
    orderBy: [{ setId: "asc" }, { sortKey: "asc" }],
    select: { setId: true, joinsNext: true, set: { select: { showId: true } } },
  });
  let best = { length: 0, showId: null as number | null };
  let run = 0;
  let current = -1;
  for (const segment of segments) {
    if (segment.setId !== current) {
      current = segment.setId;
      run = 0;
    }
    run = segment.joinsNext === "RUNS_INTO" ? run + 1 : 0;
    if (run + 1 > best.length) best = { length: run + 1, showId: segment.set.showId };
  }
  void ctx;
  return best.length > 1 ? best.showId : null;
}

/** Test 5: the setlists of ten shows, old and new. The new setlist is printed in two views. */
async function setlists(ctx: Ctx): Promise<StressResult> {
  const wanted = [[1978, 5, 23], [1983, 2, 22]];
  const shows = await ctx.db.show.findMany({
    select: { id: true, legacyId: true, dateYear: true, dateMonth: true, dateDay: true, sets: { select: { _count: { select: { segments: true } } } } },
  });
  const picked: typeof shows = [];
  for (const [y, m, d] of wanted) picked.push(...shows.filter((s) => s.dateYear === y && s.dateMonth === m && s.dateDay === d));
  // The complicated set: the show with the longest medley (a chain of segments that run into each other).
  const medleyShow = await longestMedleyShow(ctx);
  const medley = shows.find((s) => s.id === medleyShow);
  if (medley && !picked.includes(medley)) picked.push(medley);
  const biggest = shows
    .filter((s) => !picked.includes(s))
    .sort((a, b) => b.sets.reduce((n, s) => n + s._count.segments, 0) - a.sets.reduce((n, s) => n + s._count.segments, 0));
  picked.push(...biggest.slice(0, Math.max(0, 10 - picked.length)));

  const performancesBySet = groupBy(await ctx.read("performances"), "set_id");
  const setsByEvent = groupBy(await ctx.read("sets"), "event_id");
  const lines: string[] = [];
  for (const show of picked.slice(0, 10)) {
    const oldEvent = Number(String(show.legacyId).split(":")[1]);
    const note = show.id === medleyShow ? " (the complicated set: the longest medley)" : "";
    lines.push(`show ${show.id} (${show.legacyId})${note}`);
    const oldList: string[] = [];
    for (const set of (setsByEvent.get(oldEvent) ?? []).sort((a, b) => (num(a, "position") ?? 0) - (num(b, "position") ?? 0))) {
      for (const row of (performancesBySet.get(Number(set.id)) ?? []).sort((a, b) => (num(a, "performance_order") ?? 0) - (num(b, "performance_order") ?? 0))) {
        oldList.push(`performances:${row.id} song ${row.song_id}${bool(row, "segues_into") ? " >" : ""}`);
      }
    }
    const segments = await ctx.db.segment.findMany({
      where: { set: { showId: show.id } },
      orderBy: [{ set: { position: "asc" } }, { sortKey: "asc" }],
      select: { id: true, workId: true, delivery: true, joinsNext: true, extent: true, workCertainty: true, setId: true, legacyId: true },
    });
    // A stage-talk segment from show_banter has no old performance row: its old cell stays blank.
    const aligned: string[] = [];
    let nextOld = 0;
    const explicit = segments.map(
      (s) => `segment ${s.id} work ${s.workId ?? "none"}${s.delivery ? ` ${s.delivery}` : ""}${s.extent !== "COMPLETE" ? ` ${s.extent}` : ""}${s.workCertainty !== "CONFIRMED" ? ` ${s.workCertainty}` : ""}${s.joinsNext === "RUNS_INTO" ? " >" : ""}`,
    );
    segments.forEach((s) => aligned.push(String(s.legacyId ?? "").startsWith("show_banter:") ? "" : (oldList[nextOld++] ?? "")));
    aligned.push(...oldList.slice(nextOld));
    lines.push("  old | new, explicit view");
    const rows = Math.max(aligned.length, explicit.length);
    for (let i = 0; i < rows; i += 1) lines.push(`  ${(aligned[i] ?? "").padEnd(34)} | ${explicit[i] ?? ""}`);
    // Compact view: a set on one line; ">" joins segments that run into each other.
    lines.push("  new, compact view");
    const bySet = new Map<number, typeof segments>();
    for (const s of segments) bySet.set(s.setId, [...(bySet.get(s.setId) ?? []), s]);
    for (const [setId, list] of bySet) {
      const text = list.map((s, i) => `${s.workId === null ? "[spoken]" : `work ${s.workId}`}${i < list.length - 1 ? (s.joinsNext === "RUNS_INTO" ? " > " : ", ") : ""}`).join("");
      lines.push(`  set ${setId}: ${text}`);
    }
  }
  return { title: "5. Setlist views of ten shows", summary: `${Math.min(10, picked.length)} shows printed: old with the new explicit view, then the new compact view.`, lines };
}

/** Test 6 (item 84): the lineup derived from members and exceptions, against today's lineup. */
async function lineups(ctx: Ctx): Promise<StressResult> {
  const entries = await ctx.db.lineupEntry.findMany({
    select: { bandId: true, showId: true, personId: true, absent: true, dateYear: true, dateMonth: true, dateDay: true, dateEndYear: true, dateEndMonth: true, dateEndDay: true },
  });
  const shows = await ctx.db.show.findMany({ select: { id: true, legacyId: true, bandId: true, dateYear: true, dateMonth: true, dateDay: true } });
  const at = (y: number | null, m: number | null, d: number | null, fallback: number) => (y === null ? fallback : Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  const derived = (show: (typeof shows)[number]): Set<number> => {
    const date = at(show.dateYear, show.dateMonth, show.dateDay, 0);
    const out = new Set<number>();
    for (const e of entries) {
      if (e.bandId !== null && e.bandId === show.bandId) {
        const start = at(e.dateYear, e.dateMonth, e.dateDay, -Infinity);
        const end = at(e.dateEndYear, e.dateEndMonth, e.dateEndDay, Infinity);
        if (show.dateYear === null || (start <= date && date <= end)) out.add(e.personId);
      }
    }
    for (const e of entries) {
      if (e.showId !== show.id) continue;
      if (e.absent) out.delete(e.personId);
      else out.add(e.personId);
    }
    return out;
  };
  const eventMusicians = groupBy(await ctx.read("event_musicians"), "event_id");
  const bandMembers = groupBy(await ctx.read("band_musicians"), "band_id");
  const oldBandOfEvent = new Map((await ctx.read("events")).map((row) => [Number(row.id), row]));
  const lines: string[] = [];
  for (const show of shows) {
    const oldId = Number(String(show.legacyId).split(":")[1]);
    const event = oldBandOfEvent.get(oldId);
    if (!event) continue;
    const old = new Set<number>();
    const listed = eventMusicians.get(oldId) ?? [];
    // Band members who were in the band on the show date (joined and left dates), plus the
    // musicians the show lists: listed musicians are guests and add to the members.
    const date = at(show.dateYear, show.dateMonth, show.dateDay, 0);
    const members = (bandMembers.get(num(event, "primary_band_id") ?? -1) ?? []).filter((row) => {
      if (show.dateYear === null) return true;
      const joined = dateOf(row, "joined_date");
      const left = dateOf(row, "left_date");
      return (joined === null || joined.getTime() <= date) && (left === null || date <= left.getTime());
    });
    for (const row of [...members, ...listed]) {
      const person = ctx.personByMusician.get(num(row, "musician_id") ?? -1);
      if (person) old.add(person);
    }
    const now = derived(show);
    const missing = [...old].filter((p) => !now.has(p)).length;
    const extra = [...now].filter((p) => !old.has(p)).length;
    if (missing > 0 || extra > 0) lines.push(`show ${show.id} (${show.legacyId}): ${missing} in the old lineup only, ${extra} in the new only`);
  }
  return { title: "6. Lineups (item 84)", summary: `${shows.length} shows compared; ${lines.length} differ.`, lines };
}

export async function runStressTests(ctx: Ctx): Promise<{ results: StressResult[]; placeChains: string[] }> {
  const placeTest = await places(ctx);
  return {
    results: [await leadSingers(ctx), await suites(ctx), placeTest.result, await counts(ctx), await setlists(ctx), await lineups(ctx)],
    placeChains: placeTest.chains,
  };
}
