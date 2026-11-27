/**
 * The one rule of the public read layer: a record is public when its `Entity` row says so
 * (`Entity.isPublic`, data-model item 47). Every public read goes through these helpers, and
 * every public read lists the fields it selects. It never uses `include`, and it never selects
 * a private field: `Show.legacyData`, `Segment.wordsAsHeard`, a private note, a citation excerpt
 * or the wording of a rendition. A later public page reuses this file and adds its own selects.
 */

/** A relation filter: only rows whose entity is public. Use it in a `where`. */
export const PUBLIC_ENTITY = { entity: { isPublic: true } } as const;

/** Select the flag of a related record's entity, to decide in code whether to show its name. */
export const ENTITY_FLAG = { entity: { select: { isPublic: true } } } as const;

/** The name of a related record, or null when the record is missing or not public. */
export function publicName(record: { name: string; entity: { isPublic: boolean } } | null | undefined): string | null {
  return record && record.entity.isPublic ? record.name : null;
}
