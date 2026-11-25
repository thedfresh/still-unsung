import { describe, expect, it } from "vitest";
import { evidenceOf, OWN_KNOWLEDGE, type EvidenceChoice } from "@/lib/evidence-choice";

describe("evidenceOf", () => {
  it("turns the quick choice into own knowledge", () => {
    expect(evidenceOf(OWN_KNOWLEDGE)).toEqual({ evidence: { ownKnowledge: true } });
  });

  it("keeps a recent choice as the evidence, so a reordered list cannot change it", () => {
    const list = [{ evidence: { sourceId: 4, place: "page 2" } }, { evidence: { recordingId: 9 } }];
    const choice: EvidenceChoice = { kind: "recent", evidence: list[1].evidence };
    // The list is reordered after the pick (a refresh): the choice still names the same evidence.
    list.reverse();
    expect(evidenceOf(choice)).toEqual({ evidence: { recordingId: 9 } });
  });

  it("reads another choice as an ID and a place", () => {
    expect(evidenceOf({ kind: "other", type: "recording", id: " 12 ", place: " 41:10 " })).toEqual({
      evidence: { recordingId: 12, place: "41:10" },
    });
    expect(evidenceOf({ kind: "other", type: "source", id: "7", place: "" })).toEqual({ evidence: { sourceId: 7 } });
  });

  it("refuses an ID that is not a whole positive number", () => {
    for (const id of ["", "abc", "1.5", "0", "-3"]) {
      expect(evidenceOf({ kind: "other", type: "contributor", id, place: "" })).toHaveProperty("error");
    }
  });
});
