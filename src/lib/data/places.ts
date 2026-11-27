import type { PrismaClient } from "@/generated/prisma/client";
import { getPrisma } from "@/lib/db";

/**
 * Place roll-up (HSA-185). A show is attached to the most specific place known (data-model item
 * 36), nearly always a venue. A count or list of a place's shows includes every place inside it,
 * at any depth (venue → city → region → country), so a city counts the shows at its venues.
 * `UNION` (not `UNION ALL`) stops a loop if a place were ever made its own ancestor.
 */
export async function countShowsInPlace(placeId: number, db: PrismaClient = getPrisma()): Promise<{ direct: number; inside: number }> {
  const [row] = await db.$queryRaw<{ direct: bigint; inside: bigint }[]>`
    WITH RECURSIVE tree(id) AS (
      SELECT ${placeId}::int
      UNION
      SELECT p.id FROM places p JOIN tree ON p."parentId" = tree.id
    )
    SELECT
      (SELECT count(*) FROM shows WHERE "placeId" = ${placeId}) AS direct,
      (SELECT count(*) FROM shows WHERE "placeId" IN (SELECT id FROM tree)) AS inside`;
  return { direct: Number(row?.direct ?? 0), inside: Number(row?.inside ?? 0) };
}
