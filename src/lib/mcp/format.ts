import type { ApplyResult } from "@/lib/data/changes/apply";
import { showValue } from "@/lib/changes/labels";

/** The apply result as plain text. A conflict shows the stored version and the agent's version. */
export function formatApplyResult(result: ApplyResult): string {
  if (result.ok) {
    const lines = result.applied.map((a) => `- ${a.op === "create" ? "created" : "changed"} ${a.record}`);
    return [`Applied as changeset ${result.changesetId}.`, ...lines].join("\n");
  }
  if (result.reason === "blocked") return ["Nothing was written.", ...result.messages.map((m) => `- ${m}`)].join("\n");
  const lines = ["Nothing was written. A record changed since the preview. Read it again and make a new preview."];
  for (const c of result.conflicts) {
    lines.push("", `Edit ${c.index}: ${c.record} (you read version ${c.expectedRev})`);
    if (!c.current) {
      lines.push("  The record no longer exists.");
      continue;
    }
    lines.push(`  Stored version ${String(c.current.rev)}:`);
    for (const name of Object.keys(c.proposed)) lines.push(`    ${name}: ${showValue(c.current[name])}`);
    lines.push("  Your version:");
    for (const [name, value] of Object.entries(c.proposed)) lines.push(`    ${name}: ${showValue(value)}`);
  }
  return lines.join("\n");
}
