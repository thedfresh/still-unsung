import contentModel from "@/lib/content-model.json";
import type { ContentModel, ModelInfo } from "@/lib/content-model-types";

/** The Prisma schema as plain data (generated: `npm run db:content-model`). */
export const MODEL = contentModel as unknown as ContentModel;

/**
 * Tables the editing tools never write: users and sign-in, changesets, and the shared record ID
 * table (the server creates its rows itself). Backlinks and addresses are derived or routing data.
 */
const NEVER_WRITTEN = new Set([
  "Entity",
  "User",
  "Account",
  "Session",
  "VerificationToken",
  "Authenticator",
  "AgentToken",
  "Changeset",
  "ChangesetItem",
  "Backlink",
  "Address",
]);

/** The editable lists (data-model item 91). The curator adds their values in the admin. */
export const LIST_TABLES = [
  "WorkKind",
  "SetType",
  "ShowType",
  "ShowGroupKind",
  "CreditRole",
  "ReferenceKind",
  "LinkSystem",
  "RecordingType",
  "Instrument",
  "PlaceKind",
  "SourceKind",
  "SubjectKind",
  "IncompleteReason",
  "EvidenceKind",
] as const;

const LISTS = new Set<string>(LIST_TABLES);

/** Columns the server owns. The agent never sets them. */
export const SYSTEM_FIELDS = new Set(["id", "rev", "createdAt", "updatedAt", "legacyId", "previewToken"]);

/** Types that count as setlist information for the public mark (data-model item 20). */
const PUBLIC_BY_DEFAULT = new Set(["Show", "Set", "Segment", "Recording"]);

export function isKnownType(type: string): boolean {
  return Object.hasOwn(MODEL.models, type);
}

export function isList(type: string): boolean {
  return LISTS.has(type);
}

/** Why the tools refuse to write a type, or null when the agent may write it. */
export function writeRefusal(type: string): string | null {
  if (!isKnownType(type)) return `${type} is not a record type.`;
  if (LISTS.has(type)) {
    return `${type} is an editable list. Ask the user to add the value in the admin, then use its ID.`;
  }
  if (NEVER_WRITTEN.has(type)) return `${type} cannot be changed with this tool.`;
  return null;
}

/** Types the agent may read: everything it may write, plus the lists. */
export function isReadable(type: string): boolean {
  return isKnownType(type) && "id" in modelInfo(type).fields && (LISTS.has(type) || !NEVER_WRITTEN.has(type));
}

export function modelInfo(type: string): ModelInfo {
  return MODEL.models[type];
}

/** A model whose rows can change after they exist (it has a version number). */
export function isUpdatable(type: string): boolean {
  return "rev" in modelInfo(type).fields;
}

export function defaultPublicMark(types: Iterable<string>): boolean {
  for (const type of types) if (PUBLIC_BY_DEFAULT.has(type)) return true;
  return false;
}

export function writableTypes(): string[] {
  return Object.keys(MODEL.models).filter((type) => writeRefusal(type) === null);
}

export function readableTypes(): string[] {
  return Object.keys(MODEL.models).filter(isReadable);
}
