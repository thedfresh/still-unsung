import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CurrentUser, Role } from "@/lib/roles";

export interface UserRow {
  id: string;
  email: string | null;
  name: string | null;
  role: Role;
  createdAt: Date;
}

const userSelect = { id: true, email: true, name: true, role: true, createdAt: true } as const;

/** Sign-in emails are stored in lower case, so a lookup never misses on case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** The user for a session. Null when the user was removed. */
export async function findCurrentUser(id: string): Promise<Omit<CurrentUser, "via"> | null> {
  return getPrisma().user.findUnique({
    where: { id },
    select: { id: true, email: true, name: true, role: true },
  });
}

export async function listUsers(): Promise<UserRow[]> {
  return getPrisma().user.findMany({ select: userSelect, orderBy: [{ role: "asc" }, { email: "asc" }] });
}

/**
 * Add a user who may sign in. The email must be new. This is the only way to add a user
 * except the first-admin command: sign-up itself is closed.
 */
export async function addUser(input: { email: string; role: Role; name?: string | null }): Promise<UserRow> {
  const email = normalizeEmail(input.email);
  const db = getPrisma();
  if (await db.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new AppError("conflict", "A user with this email already exists.");
  }
  return db.user.create({ data: { email, role: input.role, name: input.name ?? null }, select: userSelect });
}

/**
 * Remove a user. Their sign-ins, passkeys and tokens go with them. The data layer refuses to
 * remove the last admin, and a user who already recorded changes (the history keeps them).
 */
export async function removeUser(id: string): Promise<void> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { id }, select: { role: true } });
  if (!user) throw new AppError("not_found");
  if (user.role === "ADMIN" && (await db.user.count({ where: { role: "ADMIN" } })) <= 1) {
    throw new AppError("conflict", "You cannot remove the last admin.");
  }
  try {
    await db.user.delete({ where: { id } });
  } catch (err) {
    if (typeof err === "object" && err !== null && "code" in err && err.code === "P2003") {
      throw new AppError("conflict", "This user has recorded changes and cannot be removed.");
    }
    throw err;
  }
}
