import { defineRoute } from "@/lib/api";

/**
 * Who am I: the user the request acts as, from a session or an agent access token.
 * An agent calls this to check that its token works.
 */
export const GET = defineRoute({
  roles: ["ADMIN", "AGENT"],
  handler: async (user) => ({ id: user.id, email: user.email, role: user.role, via: user.via }),
});
