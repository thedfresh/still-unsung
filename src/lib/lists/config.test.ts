import { describe, expect, it } from "vitest";
import { LIST_TABLES, MODEL } from "@/lib/content-access";
import { LIST_CONFIGS, listConfigBySlug, NO_PAGE_LISTS } from "@/lib/lists/config";

describe("list configs", () => {
  it("covers every list model, or names it on the no-page list", () => {
    const covered = new Set([...LIST_CONFIGS.map((c) => c.type), ...Object.keys(NO_PAGE_LISTS)]);
    expect(LIST_TABLES.filter((type) => !covered.has(type))).toEqual([]);
  });

  it("names no model that is not an editable list", () => {
    const lists = new Set<string>(LIST_TABLES);
    expect([...LIST_CONFIGS.map((c) => c.type), ...Object.keys(NO_PAGE_LISTS)].filter((type) => !lists.has(type))).toEqual([]);
  });

  it("has one config per model and one slug per config", () => {
    expect(new Set(LIST_CONFIGS.map((c) => c.type)).size).toBe(LIST_CONFIGS.length);
    expect(new Set(LIST_CONFIGS.map((c) => c.slug)).size).toBe(LIST_CONFIGS.length);
    expect(listConfigBySlug("set-types")?.type).toBe("SetType");
    expect(listConfigBySlug("nothing")).toBeUndefined();
  });

  it("lists only columns that exist, and every list has a position and a version number", () => {
    for (const config of LIST_CONFIGS) {
      const model = MODEL.models[config.type];
      expect(model.fields.position, config.type).toBeDefined();
      expect(model.fields.rev, config.type).toBeDefined();
      for (const field of config.fields) expect(model.fields[field.name], `${config.type}.${field.name}`).toBeDefined();
    }
  });

  it("gives every select field its options and every list a name field", () => {
    for (const config of LIST_CONFIGS) {
      expect(config.fields[0].name).toBe("name");
      for (const field of config.fields) if (field.kind === "select") expect(field.options?.length).toBeGreaterThan(0);
    }
  });

  it("keeps the rule key of a reference kind read-only", () => {
    expect(listConfigBySlug("reference-kinds")?.fields.find((f) => f.name === "ruleKey")?.readOnly).toBe(true);
  });
});
