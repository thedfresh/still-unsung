import { z } from "zod";

/** How the show list sorts: by date, newest or oldest first. */
export const SHOW_SORTS = ["newest", "oldest"] as const;
export type ShowSort = (typeof SHOW_SORTS)[number];

/** The query string of the admin show list: a short search text, a sort and a page number. */
export const showListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  sort: z.enum(SHOW_SORTS).catch("newest"),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});
