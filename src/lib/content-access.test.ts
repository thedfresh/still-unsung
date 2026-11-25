import { describe, expect, it } from "vitest";
import { AGENT_WRITABLE_TYPES, LIST_TABLES, MODEL, NEVER_WRITTEN_TYPES, writableTypes } from "@/lib/content-access";

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

  it("lets the tools write exactly the writable group", () => {
    expect(writableTypes().sort()).toEqual([...AGENT_WRITABLE_TYPES].sort());
  });
});
