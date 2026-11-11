export type CheckStatus = "ok" | "error";

export interface HealthReport {
  status: CheckStatus;
  checks: { database: CheckStatus };
}

/**
 * Turn the result of the individual checks into the health report and HTTP status
 * the deploy's health check reads. Any failing check makes the whole report fail.
 */
export function buildHealthReport(databaseOk: boolean): {
  report: HealthReport;
  httpStatus: 200 | 503;
} {
  const database: CheckStatus = databaseOk ? "ok" : "error";
  const status: CheckStatus = database === "ok" ? "ok" : "error";
  return { report: { status, checks: { database } }, httpStatus: status === "ok" ? 200 : 503 };
}
