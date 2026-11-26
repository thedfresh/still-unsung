import { describe, expect, it } from "vitest";
import { AppError } from "@/lib/errors";
import type { ParsedEdit } from "@/lib/validation/content";
import { mapDbError } from "@/lib/data/changes/write-edits";

const edit = (fields: Record<string, unknown>, extra: Partial<ParsedEdit> = {}) =>
  ({ op: "create", type: "SubjectKind", fields, ...extra }) as unknown as ParsedEdit;

describe("mapDbError (HSA-170)", () => {
  it("gives a delete that lost a race its own wording", () => {
    const error = mapDbError({ code: "P2003" }, 2, edit({}, { op: "delete", type: "Note", id: 7 })) as AppError;
    expect(error.code).toBe("conflict");
    expect(error.message).toContain("Note 7 cannot be deleted");
    expect(error.message).not.toContain("points at does not exist");
  });

  it("keeps the old wording for a create or update that points at a missing record", () => {
    const error = mapDbError({ code: "P2003" }, 0, edit({})) as AppError;
    expect(error.message).toContain("a record it points at does not exist");
  });

  it("names the list and the value of a duplicate list value", () => {
    const error = mapDbError({ code: "P2002" }, 1, edit({ name: "brand" })) as AppError;
    expect(error.code).toBe("conflict");
    expect(error.message).toContain('SubjectKind "brand" already exists');
  });

  it("keeps the general message for a duplicate in another table", () => {
    const error = mapDbError({ code: "P2002" }, 1, edit({ key: "k" }, { type: "Source" })) as AppError;
    expect(error.message).toContain("a value that must be unique is already taken");
  });
});
