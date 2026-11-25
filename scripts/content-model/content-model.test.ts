import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildContentModelJson, CONTENT_MODEL_PATH } from "./generate.ts";
import { parseSchema } from "./parse-schema.ts";

describe("content model", () => {
  it("matches the Prisma schema (run `npm run db:content-model` after a schema change)", () => {
    expect(readFileSync(CONTENT_MODEL_PATH, "utf8")).toBe(buildContentModelJson());
  });

  it("reads fields, foreign keys, enums and shared record IDs", () => {
    const model = parseSchema(`
enum Certainty {
  CONFIRMED
  PROBABLE
}
model Place {
  id Int @id
  entity Entity @relation(fields: [id], references: [id])
  name String
  @@map("places")
}
model Show {
  id Int @id
  entity Entity @relation(fields: [id], references: [id])
  placeId Int?
  place Place? @relation(fields: [placeId], references: [id])
  certainty Certainty @default(CONFIRMED)
  rev Int @default(1)
  @@map("shows")
}
model Entity {
  id Int @id
  kind EntityKind
}
enum EntityKind {
  SHOW
  PLACE
}
`);
    expect(model.models.Show.entityKind).toBe("SHOW");
    expect(model.models.Show.fields.placeId).toMatchObject({ fk: "Place", required: false });
    expect(model.models.Show.fields.certainty).toMatchObject({ enum: ["CONFIRMED", "PROBABLE"], hasDefault: true });
    expect(model.models.Show.table).toBe("shows");
    expect(model.models.Entity.entityKind).toBeNull();
  });
});
