import { describe, expect, it } from "vitest";
import { AGENT_WRITABLE_TYPES, LIST_TABLES, MODEL, NEVER_WRITTEN_TYPES, writableTypes, writeRefusal } from "@/lib/content-access";

describe("table classification", () => {
  const groups = [AGENT_WRITABLE_TYPES, NEVER_WRITTEN_TYPES, LIST_TABLES].map((g) => new Set<string>(g));

  it("puts every model in exactly one group: writable, protected or list", () => {
    const unclassified = Object.keys(MODEL.models).filter((m) => groups.filter((g) => g.has(m)).length !== 1);
    expect(unclassified).toEqual([]);
  });

  it("names no model that does not exist", () => {
    const unknown = groups.flatMap((g) => [...g]).filter((m) => !Object.hasOwn(MODEL.models, m));
    expect(unknown).toEqual([]);
  });

  it("lets the tools create exactly the writable group and the lists", () => {
    expect(writableTypes().sort()).toEqual([...AGENT_WRITABLE_TYPES, ...LIST_TABLES].sort());
  });

  it("refuses a change or delete of a list value, and allows a delete of a content record", () => {
    expect(writeRefusal("SubjectKind", "create")).toBeNull();
    expect(writeRefusal("SubjectKind", "update")).toContain("Ask the user to change list values in the admin");
    expect(writeRefusal("SubjectKind", "delete")).toContain("Ask the user to change list values in the admin");
    expect(writeRefusal("SubjectKind", "update", "ADMIN")).toBeNull();
    expect(writeRefusal("SubjectKind", "delete", "ADMIN")).toBeNull();
    expect(writeRefusal("User", "update", "ADMIN")).not.toBeNull();
    expect(writeRefusal("Citation", "delete")).toBeNull();
    expect(writeRefusal("User", "delete")).not.toBeNull();
  });
});
