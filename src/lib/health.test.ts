import { describe, expect, it } from "vitest";
import { buildHealthReport } from "./health";

describe("buildHealthReport", () => {
  it("reports ok with HTTP 200 when the database check passes", () => {
    expect(buildHealthReport(true, "1.2.3")).toEqual({
      report: { status: "ok", version: "1.2.3", checks: { database: "ok" } },
      httpStatus: 200,
    });
  });

  it("reports an error with HTTP 503 when the database check fails", () => {
    expect(buildHealthReport(false, "1.2.3")).toEqual({
      report: { status: "error", version: "1.2.3", checks: { database: "error" } },
      httpStatus: 503,
    });
  });
});
