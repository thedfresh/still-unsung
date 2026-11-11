import { connection } from "next/server";
import { getPrisma } from "@/lib/db";
import { buildHealthReport } from "@/lib/health";

/**
 * Health check for the deploy (zero-downtime switch-over and smoke tests).
 * Always runs at request time and does a real database round trip.
 */
export async function GET() {
  await connection();

  let databaseOk = false;
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    databaseOk = true;
  } catch {
    // Report the failure without leaking error details.
  }

  const { report, httpStatus } = buildHealthReport(databaseOk);
  return Response.json(report, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
