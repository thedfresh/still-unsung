import type { Evidence } from "@/lib/validation/content";

/** What the user picked in the evidence picker. The picker and the save share this shape. */
export type EvidenceChoice =
  | { kind: "own" }
  /** A recent choice, kept as the evidence itself: a refresh that reorders the list cannot change it. */
  | { kind: "recent"; evidence: Evidence }
  | { kind: "other"; type: "source" | "recording" | "contributor"; id: string; place: string };

/** The default choice: "my own knowledge" is the quick one. */
export const OWN_KNOWLEDGE: EvidenceChoice = { kind: "own" };

const ID_FIELD = { source: "sourceId", recording: "recordingId", contributor: "contributorId" } as const;

export const OTHER_LABEL = { source: "Source", recording: "Recording", contributor: "Contributor" } as const;

/**
 * Turn the choice into the evidence of a save, or into a message for the form. The server checks
 * it again: this only keeps an obvious mistake from costing a round trip.
 */
export function evidenceOf(choice: EvidenceChoice): { evidence: Evidence } | { error: string } {
  if (choice.kind === "own") return { evidence: { ownKnowledge: true } };
  if (choice.kind === "recent") return { evidence: choice.evidence };
  const id = Number(choice.id.trim());
  if (!Number.isInteger(id) || id <= 0) return { error: `Enter the ${OTHER_LABEL[choice.type].toLowerCase()} ID as a whole number.` };
  const place = choice.place.trim();
  return { evidence: { [ID_FIELD[choice.type]]: id, ...(place ? { place } : {}) } };
}
