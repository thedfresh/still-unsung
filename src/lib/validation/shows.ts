import { z } from "zod";
import { idSchema } from "@/lib/ids";

/** How the show list sorts: by date, newest or oldest first. */
export const SHOW_SORTS = ["newest", "oldest"] as const;
export type ShowSort = (typeof SHOW_SORTS)[number];

/** The query string of the admin show list: a short search text, a sort and a page number. */
export const showListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(SHOW_SORTS).catch("newest"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
  /** Filters that a count of shows links to (HSA-186). A bad ID is ignored. */
  place: idSchema.optional().catch(undefined),
  /** With `place`: only the shows attached to the place itself, not the places inside it. */
  direct: z.enum(["1"]).optional().catch(undefined),
  band: idSchema.optional().catch(undefined),
  work: idSchema.optional().catch(undefined),
});
