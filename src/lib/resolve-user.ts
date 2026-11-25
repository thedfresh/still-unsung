import { verifyAgentToken } from "@/lib/data/agent-tokens";
import { findCurrentUser } from "@/lib/data/users";
import { AppError } from "@/lib/errors";
import { tokenFailureLimiter, type RateLimiter } from "@/lib/rate-limit";
import type { CurrentUser } from "@/lib/roles";
import { bearerToken } from "@/lib/tokens";

export interface RequestIdentity {
  /** The `Authorization` header, if any. */
  authorization: string | null;
  /** The user id of the Auth.js session, if the request has a valid session. */
  sessionUserId: string | null;
  /** The client address, for rate limiting. */
  clientKey: string;
}

/**
 * Work out who a request acts as. This is the one place that decides, for the admin pages,
 * the Server Actions and the MCP server (HSA-26).
 *
 * - A request with an `Authorization: Bearer` header uses the token only. A wrong token never
 *   falls back to a session. A valid token acts as its AGENT user, never as ADMIN.
 * - Otherwise the session decides. The role is read from the database on each request, so a
 *   removed user or a changed role takes effect at once.
 * - After too many wrong tokens from one client, token checks are refused with `rate_limited`.
 */
export async function resolveUser(
  identity: RequestIdentity,
  limiter: RateLimiter = tokenFailureLimiter(),
): Promise<CurrentUser | null> {
  if (identity.authorization !== null) {
    const token = bearerToken(identity.authorization);
    if (!limiter.allowed(identity.clientKey)) throw new AppError("rate_limited");
    const user = token ? await verifyAgentToken(token) : null;
    if (!user) {
      limiter.hit(identity.clientKey);
      return null;
    }
    return { ...user, via: "token" };
  }
  if (!identity.sessionUserId) return null;
  const user = await findCurrentUser(identity.sessionUserId);
  return user ? { ...user, via: "session" } : null;
}
