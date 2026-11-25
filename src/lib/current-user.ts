import { headers } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import { auth } from "@/auth";
import { AppError } from "@/lib/errors";
import { clientKey } from "@/lib/rate-limit";
import { resolveUser } from "@/lib/resolve-user";
import { assertRole, type CurrentUser, type Role } from "@/lib/roles";
import { isBearerHeader } from "@/lib/tokens";

/**
 * The one server function that returns the signed-in user, with the role. It reads a session
 * or an agent access token. Admin pages, Server Actions and the MCP server call it; nothing
 * reads the session another way. It returns null when nobody is signed in.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  // Wait for a real request first. Auth.js reads the clock; in a prerender that is an error,
  // and `auth()` hides every error as "no session" (HSA-160). So never run it in a prerender.
  await connection();
  try {
    const requestHeaders = await headers();
    const authorization = requestHeaders.get("authorization");
    // A request that carries a token never reads the session cookie. Only a Bearer header is a
    // token: a proxy's Basic Auth header (staging) must not hide the session (HSA-160).
    const session = isBearerHeader(authorization) ? null : await auth();
    return await resolveUser({
      authorization,
      sessionUserId: session?.user?.id ?? null,
      clientKey: clientKey(requestHeaders),
    });
  } catch (err) {
    // Next.js signals pass through. A refusal by us (`AppError`) is for the caller to read.
    // Anything else is a fault: log it and fail the request. Never read it as "signed out".
    unstable_rethrow(err);
    if (!(err instanceof AppError)) console.error("getCurrentUser failed:", err);
    throw err;
  }
}

/** The signed-in user, or throw `unauthorized` (no user) or `forbidden` (wrong role). */
export async function requireUser(allowed: readonly Role[]): Promise<CurrentUser> {
  return assertRole(await getCurrentUser(), allowed);
}
