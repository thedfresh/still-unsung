import { describe, expect, it } from "vitest";
import { assertOutsideRepo, assertSafeTarget, readSettings } from "./settings";

const target = "postgresql://u:p@localhost:5433/still_unsung_dev";
const legacy = "postgresql://u:p@localhost:5433/hunter_archive_old";

describe("assertSafeTarget", () => {
  it("accepts dev, test and staging databases", () => {
    for (const name of ["still_unsung_dev", "still_unsung_test", "still_unsung_staging"]) {
      expect(() => assertSafeTarget(`postgresql://u:p@localhost:5433/${name}`, legacy)).not.toThrow();
    }
  });
  it("refuses the old copy and any other name", () => {
    expect(() => assertSafeTarget(legacy, legacy)).toThrow(/same database/);
    expect(() => assertSafeTarget("postgresql://u:p@localhost:5433/still_unsung", legacy)).toThrow(/Refusing to empty/);
    expect(() => assertSafeTarget("postgresql://u:p@localhost:5433/still_unsung_prod", legacy)).toThrow(/Refusing to empty/);
  });
});

describe("assertOutsideRepo", () => {
  it("refuses a folder inside the repository", () => {
    expect(() => assertOutsideRepo("/repo/out", "/repo")).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo("/repo", "/repo")).toThrow(/inside the repository/);
    expect(() => assertOutsideRepo("/data/import-output", "/repo")).not.toThrow();
    expect(() => assertOutsideRepo("/repo-dumps/out", "/repo")).not.toThrow();
  });
});

describe("readSettings", () => {
  const env = {
    DATABASE_URL: target,
    LEGACY_DATABASE_URL: legacy,
    IMPORT_OUTPUT_DIR: "/data/out",
    ZOTERO_KEY_LEGACY_SETLIST_LIST: "A",
    ZOTERO_KEY_GDSETS: "B",
    ZOTERO_KEY_WHITEGUM: "C",
  };
  it("reads the settings and defaults the schema", () => {
    const settings = readSettings(env);
    expect(settings.legacySchema).toBe("public");
    expect(settings.zotero).toEqual({ legacySetlistList: "A", gdsets: "B", whitegum: "C" });
    expect(settings.curatorEmail).toBeNull();
  });
  it("fails at the start when a Zotero key is missing", () => {
    expect(() => readSettings({ ...env, ZOTERO_KEY_WHITEGUM: undefined })).toThrow(/ZOTERO_KEY_WHITEGUM/);
  });
});
