import { getPrisma } from "@/lib/db";
import { AppError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/roles";
import { generateToken, hashToken } from "@/lib/tokens";

export interface AgentTokenRow {
  id: number;
  label: string;
  userEmail: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

/**
 * Make a token for an agent user. Only the hash is stored; the returned `token` is the one
 * chance to read it. A user without the AGENT role cannot have a token, so a token never acts
 * as ADMIN.
 */
export async function createAgentToken(userId: string, label: string): Promise<{ id: number; token: string }> {
  const db = getPrisma();
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } });
  if (!user) throw new AppError("not_found", "No such user.");
  if (user.role !== "AGENT") throw new AppError("forbidden", "Only a user with the AGENT role can have a token.");
  const token = generateToken();
  const row = await db.agentToken.create({ data: { userId, label, tokenHash: hashToken(token) }, select: { id: true } });
  return { id: row.id, token };
}

/** Revoke a token. A revoked token is refused at once. Revoking twice is harmless. */
export async function revokeAgentToken(id: number): Promise<void> {
  const db = getPrisma();
  const row = await db.agentToken.findUnique({ where: { id }, select: { revokedAt: true } });
  if (!row) throw new AppError("not_found");
  if (row.revokedAt) return;
  await db.agentToken.update({ where: { id }, data: { revokedAt: new Date() } });
}

export async function listAgentTokens(): Promise<AgentTokenRow[]> {
  const rows = await getPrisma().agentToken.findMany({
    orderBy: { id: "desc" },
    select: { id: true, label: true, createdAt: true, lastUsedAt: true, revokedAt: true, user: { select: { email: true } } },
  });
  return rows.map(({ user, ...rest }) => ({ ...rest, userEmail: user.email }));
}

/** Update `lastUsedAt` at most once a minute for each token, so a busy agent adds no write load. */
const LAST_USED_STEP_MS = 60_000;

/**
 * The agent user a token belongs to, or null when the token is unknown, revoked, or its user
 * no longer has the AGENT role.
 */
export async function verifyAgentToken(token: string): Promise<Omit<CurrentUser, "via"> | null> {
  const db = getPrisma();
  const row = await db.agentToken.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      id: true,
      revokedAt: true,
      lastUsedAt: true,
      user: { select: { id: true, email: true, name: true, role: true } },
    },
  });
  if (!row || row.revokedAt || row.user.role !== "AGENT") return null;
  const now = Date.now();
  if (!row.lastUsedAt || now - row.lastUsedAt.getTime() > LAST_USED_STEP_MS) {
    await db.agentToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date(now) } });
  }
  return row.user;
}
