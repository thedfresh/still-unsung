import { connection } from "next/server";
import { pingDatabase } from "@/lib/data/health";
import { buildHealthReport } from "@/lib/health";
import packageJson from "@/package.json";

/**
 * Health check for the deploy (zero-downtime switch-over and smoke tests).
 * Always runs at request time and does a real database round trip.
 */
export async function GET() {
  await connection();

  // pingDatabase reports a failure as false, without leaking error details.
  const databaseOk = await pingDatabase();

  const { report, httpStatus } = buildHealthReport(databaseOk, packageJson.version);
  return Response.json(report, {
    status: httpStatus,
    headers: { "Cache-Control": "no-store" },
  });
}
