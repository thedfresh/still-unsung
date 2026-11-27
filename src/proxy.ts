import { NextResponse, type NextRequest } from "next/server";
import { createClosedAdapter } from "@/lib/data/auth-adapter";
import { changesetExists } from "@/lib/data/changes/pending";
import { publicShowExists } from "@/lib/data/public/show";
import { showExists } from "@/lib/data/shows/review";
import { findCurrentUser } from "@/lib/data/users";
import { parseId } from "@/lib/ids";
import { listConfigBySlug } from "@/lib/lists/config";

/** The Auth.js session cookie: the secure name is used over HTTPS. */
const SESSION_COOKIES = ["__Secure-authjs.session-token", "authjs.session-token"];

/** The user ID of a valid, unexpired database session in the request, or null. */
async function sessionUserId(request: NextRequest): Promise<string | null> {
  for (const name of SESSION_COOKIES) {
    const token = request.cookies.get(name)?.value;
    if (!token) continue;
    const found = await createClosedAdapter().getSessionAndUser?.(token);
    if (found && found.session.expires > new Date()) return found.user.id;
  }
  return null;
}

/**
 * A real HTTP 404 for a bad or unknown show ID on the admin show page. With Cache Components a
 * page streams after its prerendered shell, so `notFound()` inside the page can only show the
 * not-found page with status 200. The proxy runs before the page renders, so it can set the status.
 *
 * Only a signed-in admin gets the 404. Anyone else passes through to the page, which sends them
 * to the sign-in page, so a signed-out request learns nothing about which shows exist. The proxy
 * only decides the status: the page still checks the sign-in itself.
 */
export async function proxy(request: NextRequest) {
  // The public show page: an unknown or private slug is a real 404 for everyone.
  if (request.nextUrl.pathname.startsWith("/shows/")) {
    let slug = "";
    try {
      slug = decodeURIComponent(request.nextUrl.pathname.split("/")[2] ?? "");
    } catch {
      // A malformed escape is not a slug: it falls through to the 404.
    }
    if (slug && (await publicShowExists(slug))) return NextResponse.next();
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }
  const userId = await sessionUserId(request);
  const user = userId ? await findCurrentUser(userId) : null;
  if (user?.role !== "ADMIN") return NextResponse.next();
  const parts = request.nextUrl.pathname.split("/");
  if (parts[2] === "lists") {
    if (listConfigBySlug(parts[3] ?? "")) return NextResponse.next();
    return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
  }
  const pending = parts[2] === "changes";
  const id = parseId(parts[pending ? 4 : 3]);
  if (id !== null && (await (pending ? changesetExists(id) : showExists(id)))) return NextResponse.next();
  // A path with no route renders the app's not-found page, with status 404.
  return NextResponse.rewrite(new URL("/_not-found", request.url), { status: 404 });
}

export const config = { matcher: ["/admin/shows/:id", "/admin/changes/pending/:id", "/admin/lists/:list","/shows/:slug"] };
