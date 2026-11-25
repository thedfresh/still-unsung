import type { PrismaClient } from "@/generated/prisma/client";
import { MODEL } from "@/lib/content-access";
import { describeOrigin, shortDate } from "@/lib/shows/review-words";
import { DATE_SELECT, JOIN } from "./review-queries";

/** The record types the page shows, by the name the content model uses. */
export type OriginType = "Show" | "Set" | "Segment" | "VocalEntry" | "LineupEntry" | "BillEntry" | "Recording" | "Reference" | "Citation" | "Note";

export type OriginLookup = (type: OriginType, id: number) => string | null;

/**
 * Where each record came from (data-model item 109): the changeset that created it, with its
 * evidence, as one short line. One query for the whole page. A record with no stored creation,
 * for example one made before changesets existed, has no line.
 */
export async function loadOrigins(db: PrismaClient, wanted: Map<OriginType, number[]>): Promise<OriginLookup> {
  const tableOf = (type: OriginType) => MODEL.models[type].table;
  const clauses = [...wanted].filter(([, ids]) => ids.length > 0).map(([type, ids]) => ({ tableName: tableOf(type), recordId: { in: ids } }));
  const lines = new Map<string, string>();
  if (clauses.length > 0) {
    const items = await db.changesetItem.findMany({
      ...JOIN,
      where: { action: "CREATE", OR: clauses, changeset: { status: "APPLIED" } },
      orderBy: { id: "asc" },
      select: {
        tableName: true,
        recordId: true,
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
            recording: { select: { description: true, show: { select: DATE_SELECT } } },
          },
        },
      },
    });
    for (const { tableName, recordId, changeset } of items) {
      const recording = changeset.recording;
      lines.set(
        `${tableName}:${recordId}`,
        describeOrigin({
          path: changeset.path,
          role: changeset.user.role,
          when: changeset.appliedAt ?? changeset.createdAt,
          ownKnowledge: changeset.ownKnowledge,
          sourceTitle: changeset.source?.title ?? null,
          recordingName: recording ? (recording.description ?? `recording of the show on ${shortDate(recording.show)}`) : null,
          contributorName: changeset.contributor?.name ?? null,
          place: changeset.place,
        }),
      );
    }
  }
  return (type, id) => lines.get(`${tableOf(type)}:${id}`) ?? null;
}
