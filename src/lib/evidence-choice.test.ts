import { describe, expect, it } from "vitest";
import { evidenceOf, OWN_KNOWLEDGE } from "@/lib/evidence-choice";

describe("evidenceOf", () => {
  it("turns the quick choice into own knowledge", () => {
    expect(evidenceOf(OWN_KNOWLEDGE, [])).toEqual({ evidence: { ownKnowledge: true } });
  });

  it("uses a recent choice by position", () => {
    const recent = [{ evidence: { sourceId: 4, place: "page 2" } }];
    expect(evidenceOf({ kind: "recent", index: 0 }, recent)).toEqual({ evidence: { sourceId: 4, place: "page 2" } });
    expect(evidenceOf({ kind: "recent", index: 3 }, recent)).toHaveProperty("error");
  });

  it("reads another choice as an ID and a place", () => {
    expect(evidenceOf({ kind: "other", type: "recording", id: " 12 ", place: " 41:10 " }, [])).toEqual({
      evidence: { recordingId: 12, place: "41:10" },
    });
    expect(evidenceOf({ kind: "other", type: "source", id: "7", place: "" }, [])).toEqual({ evidence: { sourceId: 7 } });
  });

  it("refuses an ID that is not a whole positive number", () => {
    for (const id of ["", "abc", "1.5", "0", "-3"]) {
      expect(evidenceOf({ kind: "other", type: "contributor", id, place: "" }, [])).toHaveProperty("error");
    }
  });
});
