import { z } from "zod";

/**
 * The four catalogue lists of the admin (works, people, bands, places). One config each, one
 * generic page. Shows have their own list page because they sort by date.
 */
export const ENTITY_KINDS = ["works", "people", "bands", "places"] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export interface EntityKindConfig {
  kind: EntityKind;
  /** The heading of the list page. */
  plural: string;
  /** For a sentence: "No work matches." */
  singular: string;
  /** The search box label. */
  searchLabel: string;
}

export const ENTITY_CONFIGS: Record<EntityKind, EntityKindConfig> = {
  works: { kind: "works", plural: "Works", singular: "work", searchLabel: "Search by title or other name" },
  people: { kind: "people", plural: "People", singular: "person", searchLabel: "Search by name, key or other name" },
  bands: { kind: "bands", plural: "Bands", singular: "band", searchLabel: "Search by name" },
  places: { kind: "places", plural: "Places", singular: "place", searchLabel: "Search by name, or by a city or region it is in" },
};

export function entityKindOf(text: string): EntityKind | null {
  return (ENTITY_KINDS as readonly string[]).includes(text) ? (text as EntityKind) : null;
}

export const SORTS = ["name", "name-desc", "recent"] as const;
export type EntitySort = (typeof SORTS)[number];

export const SORT_LABEL: Record<EntitySort, string> = {
  name: "Name, A to Z",
  "name-desc": "Name, Z to A",
  recent: "Recently changed",
};

/** The query string of a list page: a search text, a sort and a page number. Bad values fall back. */
export const entityListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(SORTS).catch("name"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  /** Places only: a place kind ("venue", "city"…), "all" or "none" (no kind). Empty: the default. */
  type: z.string().trim().toLowerCase().max(40).catch(""),
});

/** Places list: venues by default (user, 2026-11-27: cities and states are rarely edited). */
export const DEFAULT_PLACE_TYPE = "venue";

export const ENTITIES_PER_PAGE = 50;
