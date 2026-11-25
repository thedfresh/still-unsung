import { randomBytes } from "node:crypto";
import { config } from "dotenv";
import pg from "pg";
import { assertTestDatabase } from "./assert-test-database";

// Browser tests use plain SQL, because Playwright cannot load the generated Prisma client.
config({ path: ".env.test", quiet: true });

async function query<T extends pg.QueryResultRow>(text: string, values: unknown[] = []): Promise<T[]> {
  assertTestDatabase(process.env.DATABASE_URL);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

/** A unique, obviously fake email, so parallel tests never collide. */
export function uniqueEmail(label: string): string {
  return `${label}-${randomBytes(4).toString("hex")}@example.test`;
}

/** A user the admin "added": the only kind that can sign in. */
export async function seedUser(email: string, role: "ADMIN" | "AGENT"): Promise<string> {
  const id = `test${randomBytes(10).toString("hex")}`;
  await query(`INSERT INTO users (id, email, name, role, "updatedAt") VALUES ($1, $2, 'Test User', $3::"UserRole", now())`, [
    id,
    email,
    role,
  ]);
  return id;
}

/** A user plus a database session for them: the cookie value signs a browser in. */
export async function seedSignedInUser(role: "ADMIN" | "AGENT") {
  const email = uniqueEmail(role.toLowerCase());
  const id = await seedUser(email, role);
  const sessionToken = randomBytes(24).toString("hex");
  await query(`INSERT INTO sessions ("sessionToken", "userId", expires, "updatedAt") VALUES ($1, $2, now() + interval '1 hour', now())`, [
    sessionToken,
    id,
  ]);
  return { id, email, sessionToken };
}

export async function countUsers(email: string): Promise<number> {
  return Number((await query<{ n: string }>("SELECT count(*) AS n FROM users WHERE email = $1", [email]))[0].n);
}

export async function countPasskeys(userId: string): Promise<number> {
  return Number((await query<{ n: string }>('SELECT count(*) AS n FROM authenticators WHERE "userId" = $1', [userId]))[0].n);
}
