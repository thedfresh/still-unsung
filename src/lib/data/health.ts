import { getPrisma } from "@/lib/db";

/** True when the database answers a trivial query. Never throws and never exposes error details. */
export async function pingDatabase(): Promise<boolean> {
  try {
    await getPrisma().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}
