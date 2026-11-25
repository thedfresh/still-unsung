import { describe, expect, it } from "vitest";
import { parseEdits, parseEvidence } from "@/lib/validation/content";

function problems(input: unknown): Record<string, string[]> {
  try {
    parseEdits(input);
  } catch (err) {
    return (err as { fields?: Record<string, string[]> }).fields ?? {};
  }
  throw new Error("expected invalid_input");
}

describe("parseEdits", () => {
  it("accepts a new show with a partial date", () => {
    const [edit] = parseEdits([{ op: "create", type: "Show", fields: { dateYear: 1978, dateMonth: 5 } }]);
    expect(edit.fields).toEqual({ dateYear: 1978, dateMonth: 5 });
  });

  it("checks each type's own required fields and enums", () => {
    expect(problems([{ op: "create", type: "Set", fields: { position: 1 } }])).toHaveProperty(["edits.0.fields.showId"]);
    expect(problems([{ op: "create", type: "Show", fields: { dateCertainty: "MAYBE" } }])).toHaveProperty(["edits.0.fields.dateCertainty"]);
    expect(problems([{ op: "create", type: "Show", fields: { dateMonth: 13 } }])).toHaveProperty(["edits.0.fields.dateMonth"]);
  });

  it("refuses types an agent may not write, and says why", () => {
    expect(problems([{ op: "create", type: "SetType", fields: { name: "x", displayName: "x" } }])["edits.0.type"][0]).toContain("Ask the user");
    for (const type of ["User", "Changeset", "AgentToken", "Entity", "Nope"]) {
      expect(problems([{ op: "create", type, fields: {} }])).toHaveProperty(["edits.0.type"]);
    }
  });

  it("refuses fields the server owns", () => {
    for (const field of ["id", "rev", "createdAt", "updatedAt", "legacyId"]) {
      expect(problems([{ op: "create", type: "Show", fields: { [field]: 1 } }])).toHaveProperty(["edits.0.fields"]);
    }
  });

  it("needs the version for a change, and at least one field", () => {
    expect(problems([{ op: "update", type: "Show", id: 1, fields: { timeLabel: "x" } }])).toHaveProperty(["edits.0.rev"]);
    expect(problems([{ op: "update", type: "Show", id: 1, rev: 1, fields: {} }])).toHaveProperty(["edits.0.fields"]);
  });

  it("lets an optional field be cleared but not a required one", () => {
    expect(parseEdits([{ op: "update", type: "Show", id: 1, rev: 1, fields: { timeLabel: null } }])[0].fields.timeLabel).toBeNull();
    expect(problems([{ op: "update", type: "Set", id: 1, rev: 1, fields: { position: null } }])).toHaveProperty(["edits.0.fields.position"]);
  });

  it("checks that a ref names an earlier new record of the right type", () => {
    const ok = [
      { op: "create", type: "Show", ref: "s", fields: {} },
      { op: "create", type: "Set", fields: { showId: { ref: "s" }, position: 1, setTypeId: 1 } },
    ];
    expect(parseEdits(ok)).toHaveLength(2);
    expect(problems([ok[1], ok[0]])).toHaveProperty(["edits.0.fields.showId"]);
    expect(problems([{ op: "create", type: "Place", ref: "p", fields: {} }, ok[1].fields.showId && { ...ok[1], fields: { ...ok[1].fields, showId: { ref: "p" } } }])).toHaveProperty(["edits.1.fields.showId"]);
  });

  it("reads date and time columns", () => {
    const [edit] = parseEdits([{ op: "create", type: "Show", fields: { scheduledTime: "20:30" } }]);
    expect(edit.fields.scheduledTime).toEqual(new Date("1970-01-01T20:30:00.000Z"));
    expect(problems([{ op: "create", type: "Show", fields: { scheduledTime: "25:99" } }])).toHaveProperty(["edits.0.fields.scheduledTime"]);
  });

  it("refuses a Json field and an empty list", () => {
    expect(problems([{ op: "create", type: "Source", fields: { zoteroData: {} } }])).toBeTruthy();
    expect(problems([])).toHaveProperty(["edits"]);
  });
});

describe("parseEvidence", () => {
  it("needs exactly one kind of evidence", () => {
    expect(parseEvidence({ sourceId: 3, place: "p. 4" })).toEqual({ sourceId: 3, place: "p. 4" });
    expect(parseEvidence({ ownKnowledge: true })).toEqual({ ownKnowledge: true });
    expect(() => parseEvidence({})).toThrow();
    expect(() => parseEvidence({ ownKnowledge: true, sourceId: 3 })).toThrow();
    expect(() => parseEvidence({ sourceId: 3, extra: 1 })).toThrow();
  });
});
