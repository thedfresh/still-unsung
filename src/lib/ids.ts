import { z } from "zod";

/** The largest value of a Postgres `integer` column (Prisma `Int`). */
export const MAX_ID = 2_147_483_647;

/**
 * A database ID from any input: a positive integer, or a string of digits as found in
 * URLs and form data. Rejects "0", "-1", "1.5", "1e3", " 7", "007" and values above MAX_ID.
 */
export const idSchema = z
  .union([z.number(), z.string().regex(/^[1-9][0-9]*$/, "Not a valid ID.").transform(Number)])
  .pipe(z.number().int().min(1).max(MAX_ID));

/** Parse an ID, or return null when it is not valid. The caller decides between 400 and 404. */
export function parseId(value: unknown): number | null {
  const result = idSchema.safeParse(value);
  return result.success ? result.data : null;
}
