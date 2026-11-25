import { changedFields, filledFields, isPublicText, showValue, withType, type Row } from "@/lib/changes/labels";

export interface PreviewItem {
  op: "create" | "update";
  type: string;
  label: string;
  before: Row | null;
  after: Row;
  /** The records a new record points at, as readable names. */
  attachesTo: string[];
  /** For each field that points at a record: that record, by field. */
  links: { before: Record<string, LinkInfo>; after: Record<string, LinkInfo> };
}

/** The record a field points at. */
export interface LinkInfo {
  type: string;
  /** The readable name with its type, for example `Work "Ripple"`. */
  label: string;
  /** The name alone, for example `Ripple`. */
  name: string;
  /** True when the record is created in the same call: it has no final ID yet. */
  isNew: boolean;
}

export interface PreviewData {
  items: PreviewItem[];
  evidence: string;
  /** The records that get a citation from the evidence. */
  citedLabels: string[];
  isPublic: boolean;
  warnings: string[];
  expiresAt: Date | null;
  token: string | null;
}

/**
 * The preview as plain text, for the user to approve in chat. This is the one formatter: change
 * the wording here. The format is a starting definition; the user judges it on real previews.
 */
/**
 * A field value as text. A link shows the ID with the name of the record, `1485 (Beedle Um Bum)`.
 * A link to a record made in the same call shows `(new) Note "..."`.
 */
function showField(value: unknown, link: LinkInfo | undefined, full: boolean): string {
  if (!link) return showValue(value, full);
  return link.isNew ? `(new) ${withType(link.type, link.label)}` : `${String(value)} (${link.name})`;
}

export function formatPreview(preview: PreviewData): string {
  const lines: string[] = [];
  if (preview.warnings.length > 0) {
    lines.push("WARNINGS (nothing can be applied until these are fixed):");
    for (const warning of preview.warnings) lines.push(`- ${warning}`);
    lines.push("");
  }
  for (const item of preview.items) {
    if (item.op === "create") {
      lines.push(`NEW ${withType(item.type, item.label)}`);
      for (const [field, value] of filledFields(item.type, item.after)) lines.push(`  ${field}: ${showField(value, item.links.after[field], isPublicText(item.type, field, item.after))}`);
      for (const target of item.attachesTo) lines.push(`  attaches to: ${target}`);
    } else {
      lines.push(`CHANGE ${withType(item.type, item.label)}`);
      for (const [field, from, to] of changedFields(item.before ?? {}, item.after)) {
        lines.push(`  ${field}: ${showField(from, item.links.before[field], isPublicText(item.type, field, item.before))} → ${showField(to, item.links.after[field], isPublicText(item.type, field, item.after))}`);
      }
    }
  }
  if (preview.items.length > 0) {
    lines.push("", `Evidence: ${preview.evidence}`);
    lines.push(
      preview.citedLabels.length > 0
        ? `Citations written for: ${preview.citedLabels.join("; ")}`
        : "Citations written for: none",
    );
    lines.push(`Listed in recent changes: ${preview.isPublic ? "yes" : "no"}. Change it with apply_changes.`);
  }
  if (preview.token && preview.expiresAt) {
    lines.push("", `Apply token: ${preview.token}`, `It works once and expires at ${preview.expiresAt.toISOString()}.`);
  }
  return lines.join("\n");
}
