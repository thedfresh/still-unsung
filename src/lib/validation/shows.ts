import { z } from "zod";

/** The query string of the admin show list: a short search text and a page number. */
export const showListParamsSchema = z.object({
  q: z.string().trim().max(100).catch(""),
  page: z.coerce.number().int().min(1).max(100_000).catch(1),
});
