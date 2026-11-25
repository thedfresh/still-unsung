import contentModel from "@/lib/content-model.json";
import type { ContentModel, ModelInfo } from "@/lib/content-model-types";

/** The Prisma schema as plain data (generated: `npm run db:content-model`). */
export const MODEL = contentModel as unknown as ContentModel;

/**
 * Tables the editing tools never write: users and sign-in, changesets, and the shared record ID
 * table (the server creates its rows itself). Backlinks and addresses are derived or routing data.
 */
export const NEVER_WRITTEN_TYPES = [
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
] as const;

/**
 * The content tables an agent may create and change. Every model must be in this list, in
 * `NEVER_WRITTEN_TYPES` or in `LIST_TABLES`: a test fails for a model in none, so a new table is
 * never agent-writable by default.
 */
export const AGENT_WRITABLE_TYPES = [
  "Show",
  "Set",
  "Segment",
  "PortionEntry",
  "SegmentVariant",
  "VocalEntry",
  "LineupEntry",
  "LineupInstrument",
  "BillEntry",
  "Recording",
  "Place",
  "PlaceName",
  "ShowGroup",
  "ShowGroupMember",
  "Period",
  "Band",
  "Person",
  "PersonInstrument",
  "Work",
  "WorkSinger",
  "Credit",
  "SuitePart",
  "Passage",
  "Version",
  "VersionBasis",
  "VersionPassage",
  "Variant",
  "VariantPassage",
  "Rendition",
  "Appearance",
  "Subject",
  "Source",
  "SourceCreator",
  "SourceWork",
  "Reference",
  "Citation",
  "Note",
  "NoteAttachment",
  "GuidePage",
  "Tag",
  "TagAssignment",
  "ExternalId",
] as const;

const WRITABLE = new Set<string>(AGENT_WRITABLE_TYPES);

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
  if (!WRITABLE.has(type)) return `${type} cannot be changed with this tool.`;
  return null;
}

/** Types the agent may read: everything it may write, plus the lists. */
export function isReadable(type: string): boolean {
  return isKnownType(type) && "id" in modelInfo(type).fields && (LISTS.has(type) || WRITABLE.has(type));
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

/**
 * True when the model's public setting lives in its `entities` row. A model with its own
 * `isPublic` column (a note) keeps the setting there, as a plain field.
 */
export function usesEntityPublicFlag(type: string): boolean {
  const info = modelInfo(type);
  return info.entityKind !== null && !("isPublic" in info.fields);
}
