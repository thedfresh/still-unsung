import { formatReadout, type LinkInfo, type ReadoutItem } from "@/lib/changes/readout";

export type { LinkInfo };

/** One previewed record. It has the same shape as a stored item, so one readout words both. */
export type PreviewItem = ReadoutItem & { label: string };

export interface PreviewData {
  items: PreviewItem[];
  evidence: string;
  isPublic: boolean;
  warnings: string[];
  expiresAt: Date | null;
  token: string | null;
}

/**
 * The preview as plain text, for the user to approve in chat. The words for the changes
 * themselves come from `formatReadout`, which the Changes page uses too. Only the warnings, the
 * evidence and the apply token are added here.
 */
export function formatPreview(preview: PreviewData, pageUrl?: string | null): string {
  const lines: string[] = [];
  if (preview.warnings.length > 0) {
    lines.push("WARNINGS (nothing can be applied until these are fixed):");
    for (const warning of preview.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  if (preview.items.length > 0) {
    lines.push(formatReadout(preview.items));
    lines.push("", `Evidence: ${preview.evidence}`);
    lines.push(`Listed in recent changes: ${preview.isPublic ? "yes" : "no"}. Change it with apply_changes.`);
  }
  if (preview.token && preview.expiresAt) {
    lines.push("", `Apply token: ${preview.token}`, `It works once and expires at ${preview.expiresAt.toISOString()}.`);
  }
  if (pageUrl) lines.push("", `Read this change as cards (admin sign-in needed): ${pageUrl}`);
  return lines.join("\n");
}
