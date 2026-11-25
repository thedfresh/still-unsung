import { describe, expect, it } from "vitest";
import { assertTestDatabase } from "./assert-test-database";

const base = "postgresql://user:pass@localhost:5433";

describe("assertTestDatabase", () => {
  it("accepts a database whose name ends in _test", () => {
    expect(() => assertTestDatabase(`${base}/still_unsung_test`)).not.toThrow();
    expect(() => assertTestDatabase(`${base}/still_unsung_test?schema=public`)).not.toThrow();
  });

  it("refuses the dev, staging and production databases", () => {
    for (const name of ["still_unsung_dev", "still_unsung_staging", "still_unsung"]) {
      expect(() => assertTestDatabase(`${base}/${name}`)).toThrow(/not a test database/);
    }
  });

  it("refuses a name that only contains test", () => {
    expect(() => assertTestDatabase(`${base}/test_data_prod`)).toThrow(/not a test database/);
  });

  it("refuses a missing or invalid address", () => {
    expect(() => assertTestDatabase(undefined)).toThrow(/not set/);
    expect(() => assertTestDatabase("not a url")).toThrow(/not a valid/);
  });
});
