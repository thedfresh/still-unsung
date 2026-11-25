import type { PrismaClient } from "@/generated/prisma/client";
import { MODEL } from "@/lib/content-access";
import { describeOrigin, shortDate } from "@/lib/shows/review-words";
import { DATE_SELECT, JOIN } from "./review-queries";

/** The record types the page shows, by the name the content model uses. */
export type OriginType = "Show" | "Set" | "Segment" | "VocalEntry" | "LineupEntry" | "BillEntry" | "Recording" | "Reference" | "Citation" | "Note";

/** The origin line of a record, or null when it has none or it equals the show's one. */
export type OriginLookup = (type: OriginType, id: number) => string | null;

export interface Origins {
  /** Only a record whose origin differs from `main` gets a line. */
  lookup: OriginLookup;
  /** The origin of the change that created most of the page's records: shown once, under the show header. */
  main: string | null;
}

/**
 * Where each record came from (data-model item 109): the changeset that created it, with its
 * evidence, as one short line. One query for the whole page. A record with no stored creation,
 * for example one made before changesets existed, has no line. The page shows the line of the
 * change that created most records once; a record shows its own line only when it differs
 * (another change, other evidence or another date). `showId` is the show of the page.
 */
export async function loadOrigins(db: PrismaClient, wanted: Map<OriginType, number[]>, showId: number): Promise<Origins> {
  const tableOf = (type: OriginType) => MODEL.models[type].table;
  const clauses = [...wanted].filter(([, ids]) => ids.length > 0).map(([type, ids]) => ({ tableName: tableOf(type), recordId: { in: ids } }));
  const lines = new Map<string, string>();
  const counts = new Map<number, { line: string; count: number }>();
  if (clauses.length > 0) {
    const items = await db.changesetItem.findMany({
      ...JOIN,
      where: { action: "CREATE", OR: clauses, changeset: { status: "APPLIED" } },
      orderBy: { id: "asc" },
      select: {
        tableName: true,
        recordId: true,
        changesetId: true,
        changeset: {
          select: {
            path: true,
            createdAt: true,
            appliedAt: true,
            ownKnowledge: true,
            place: true,
            user: { select: { role: true } },
            source: { select: { title: true } },
            contributor: { select: { name: true } },
            recording: { select: { description: true, showId: true, show: { select: DATE_SELECT } } },
          },
        },
      },
    });
    for (const { tableName, recordId, changesetId, changeset } of items) {
      const recording = changeset.recording;
      const line = describeOrigin({
        path: changeset.path,
        role: changeset.user.role,
        when: changeset.appliedAt ?? changeset.createdAt,
        ownKnowledge: changeset.ownKnowledge,
        sourceTitle: changeset.source?.title ?? null,
        recordingName: recording ? (recording.description ?? `recording of the show on ${shortDate(recording.show)}`) : null,
        contributorName: changeset.contributor?.name ?? null,
        place: changeset.place,
        ownShowRecording: recording && recording.showId === showId ? { description: recording.description } : null,
      });
      lines.set(`${tableName}:${recordId}`, line);
      counts.set(changesetId, { line, count: (counts.get(changesetId)?.count ?? 0) + 1 });
    }
  }
  // The most records wins; the earlier change (first seen) wins a tie.
  let main: { line: string; count: number } | null = null;
  for (const entry of counts.values()) if (!main || entry.count > main.count) main = entry;
  const mainLine = main?.line ?? null;
  return {
    main: mainLine,
    lookup: (type, id) => {
      const line = lines.get(`${tableOf(type)}:${id}`) ?? null;
      return line === mainLine ? null : line;
    },
  };
}
