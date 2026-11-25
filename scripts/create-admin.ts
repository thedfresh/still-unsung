import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.ts";

// Usage: node --env-file=.env scripts/create-admin.ts
// The one-time command that makes the curator's user, with the ADMIN role. The email comes
// from CURATOR_EMAIL, the same setting the legacy import uses. Sign-up is closed, so this is
// how the first admin exists. It is safe to run again: it never changes an existing user.
const url = process.env.DATABASE_URL;
const email = process.env.CURATOR_EMAIL?.trim().toLowerCase();
if (!url) throw new Error("DATABASE_URL is not set");
if (!email) throw new Error("CURATOR_EMAIL is not set");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
try {
  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A user with this email already exists (role ${existing.role}). Nothing changed.`);
  } else {
    await db.user.create({ data: { email, name: "The curator", role: "ADMIN" } });
    console.log("Created the ADMIN user. Sign in with Google or add a passkey.");
  }
} finally {
  await db.$disconnect();
}
