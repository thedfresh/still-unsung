/**
 * Read `prisma/schema.prisma` and describe each model and enum as plain data. The result is
 * checked in as `src/lib/content-model.json`, so the app can validate edits to any content table
 * without importing Prisma. A test fails when the checked-in file is out of date.
 */

import type { ContentModel, FieldInfo, ModelInfo } from "../../src/lib/content-model-types.ts";

const SCALARS = new Set(["String", "Int", "Boolean", "DateTime", "Json", "Float", "Decimal", "BigInt", "Bytes"]);

function snake(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toUpperCase();
}

function blocks(source: string, keyword: "model" | "enum"): Array<{ name: string; lines: string[] }> {
  const out: Array<{ name: string; lines: string[] }> = [];
  const re = new RegExp(`^${keyword}\\s+(\\w+)\\s*\\{([\\s\\S]*?)^\\}`, "gm");
  for (const match of source.matchAll(re)) {
    const lines = match[2]
      .split("\n")
      .map((line) => line.replace(/\/\/.*$/, "").trim())
      .filter((line) => line.length > 0);
    out.push({ name: match[1], lines });
  }
  return out;
}

export function parseSchema(source: string): ContentModel {
  const enums: Record<string, string[]> = {};
  for (const block of blocks(source, "enum")) enums[block.name] = block.lines.filter((l) => /^\w+$/.test(l));

  const raw = blocks(source, "model");
  const modelNames = new Set(raw.map((m) => m.name));
  const entityKinds = new Set(enums.EntityKind ?? []);
  const models: Record<string, ModelInfo> = {};

  for (const block of raw) {
    const fields: Record<string, FieldInfo> = {};
    const fkByColumn: Record<string, string> = {};
    let table = block.name;
    let hasEntityRelation = false;
    for (const line of block.lines) {
      const map = /^@@map\("([^"]+)"\)/.exec(line);
      if (map) table = map[1];
      if (line.startsWith("@@")) continue;
      const field = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!field) continue;
      const [, name, type, list, optional, attrs] = field;
      if (modelNames.has(type)) {
        const relation = /@relation\([^)]*fields:\s*\[([^\]]+)\]/.exec(attrs);
        if (relation) {
          const columns = relation[1].split(",").map((c) => c.trim());
          for (const column of columns) {
            const lower = type.charAt(0).toLowerCase() + type.slice(1);
            if (columns.length === 1 || column === `${lower}Id`) fkByColumn[column] = type;
          }
          if (type === "Entity" && columns.length === 1 && columns[0] === "id") hasEntityRelation = true;
        }
        continue;
      }
      if (!SCALARS.has(type) && !(type in enums)) throw new Error(`Unknown type ${type} on ${block.name}.${name}`);
      const info: FieldInfo = { type, required: !optional && !list, list: Boolean(list), hasDefault: attrs.includes("@default(") };
      if (type in enums) info.enum = enums[type];
      const db = /@db\.(Date|Time)\b/.exec(attrs);
      if (db) info.dbType = db[1] as "Date" | "Time";
      if (/@id\b/.test(attrs)) info.isId = true;
      if (attrs.includes("@updatedAt")) info.isUpdatedAt = true;
      fields[name] = info;
    }
    for (const [column, target] of Object.entries(fkByColumn)) if (fields[column]) fields[column].fk = target;
    const kind = snake(block.name);
    models[block.name] = {
      delegate: block.name.charAt(0).toLowerCase() + block.name.slice(1),
      table,
      fields,
      entityKind: hasEntityRelation && entityKinds.has(kind) ? kind : null,
    };
  }
  return { enums, models };
}
