import { describe, expect, it } from "vitest";
import { buildHealthReport } from "./health";

describe("buildHealthReport", () => {
  it("reports ok with HTTP 200 when the database check passes", () => {
    expect(buildHealthReport(true)).toEqual({
      report: { status: "ok", checks: { database: "ok" } },
      httpStatus: 200,
    });
  });

  it("reports an error with HTTP 503 when the database check fails", () => {
    expect(buildHealthReport(false)).toEqual({
      report: { status: "error", checks: { database: "error" } },
      httpStatus: 503,
    });
  });
});
