import { createHash, randomBytes } from "node:crypto";

/** A token starts with this, so a leaked one is easy to spot and to scan for. */
export const TOKEN_PREFIX = "suat_";

/**
 * A new agent access token: 32 random bytes (256 bits), written in base64url.
 * With so much randomness a fast hash (SHA-256) is enough to store it safely.
 */
export function generateToken(): string {
  return TOKEN_PREFIX + randomBytes(32).toString("base64url");
}

/** The only form of a token the database stores. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * True when an `Authorization` header uses the Bearer scheme, the only one that carries an agent
 * token. Any other scheme (for example a proxy's Basic Auth) is not ours, so the session decides.
 */
export function isBearerHeader(header: string | null | undefined): header is string {
  return !!header && /^Bearer(\s|$)/i.test(header.trim());
}

/** Read the token from an `Authorization: Bearer <token>` header, or null. */
export function bearerToken(header: string | null | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer +(\S+)$/i.exec(header.trim());
  return match ? match[1] : null;
}
