import { connection } from "next/server";
import { requireUser } from "@/lib/current-user";
import { errorResponse } from "@/lib/errors";
import type { CurrentUser, Role } from "@/lib/roles";

/**
 * Define an API route handler for other programs (docs/CONVENTIONS.md, section 4): check the
 * role, run the handler, set `Cache-Control: no-store` and report errors in the one error
 * shape. The role check comes first.
 *
 * Not built yet, because no route needs them: Zod parsing of params, query and body, and a
 * `Cache-Control` choice per route. The first route with input adds them here.
 */
export function defineRoute(config: {
  roles: readonly Role[];
  handler: (user: CurrentUser, request: Request) => Promise<unknown>;
}) {
  return async (request: Request): Promise<Response> => {
    // A route that reads the request always runs at request time, never at build time. This
    // stays outside the try block: Next.js ends a prerender by throwing from here.
    await connection();
    try {
      const user = await requireUser(config.roles);
      const data = await config.handler(user, request);
      // A handler may build its own response (the MCP server does).
      if (data instanceof Response) return data;
      return Response.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  };
}
