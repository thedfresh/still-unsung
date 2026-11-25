import { readFileSync, writeFileSync } from "node:fs";
import { parseSchema } from "./parse-schema.ts";

/** Build the checked-in description of the content tables from the Prisma schema. */
export function buildContentModelJson(schemaPath = "prisma/schema.prisma"): string {
  return `${JSON.stringify(parseSchema(readFileSync(schemaPath, "utf8")), null, 1)}\n`;
}

export const CONTENT_MODEL_PATH = "src/lib/content-model.json";

if (process.argv[1]?.endsWith("generate.ts")) {
  writeFileSync(CONTENT_MODEL_PATH, buildContentModelJson());
  console.log(`Wrote ${CONTENT_MODEL_PATH}`);
}
