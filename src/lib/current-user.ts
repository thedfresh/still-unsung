import { headers } from "next/headers";
import { auth } from "@/auth";
import { clientKey } from "@/lib/rate-limit";
import { resolveUser } from "@/lib/resolve-user";
import { assertRole, type CurrentUser, type Role } from "@/lib/roles";

/**
 * The one server function that returns the signed-in user, with the role. It reads a session
 * or an agent access token. Admin pages, Server Actions and the MCP server call it; nothing
 * reads the session another way. It returns null when nobody is signed in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");
  // A request that carries a token never reads the session cookie.
  const session = authorization === null ? await auth() : null;
  return resolveUser({
    authorization,
    sessionUserId: session?.user?.id ?? null,
    clientKey: clientKey(requestHeaders),
  });
}

/** The signed-in user, or throw `unauthorized` (no user) or `forbidden` (wrong role). */
export async function requireUser(allowed: readonly Role[]): Promise<CurrentUser> {
  return assertRole(await getCurrentUser(), allowed);
}
