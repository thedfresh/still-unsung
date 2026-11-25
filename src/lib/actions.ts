import type { z } from "zod";
import { toErrorBody, type ErrorBody } from "@/lib/errors";
import type { CurrentUser, Role } from "@/lib/roles";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: ErrorBody["error"] };

/** Loaded on first use, so the unit tests of this file need no Next.js or Auth.js runtime. */
async function requireRequestUser(roles: readonly Role[]): Promise<CurrentUser> {
  return (await import("@/lib/current-user")).requireUser(roles);
}

interface ActionConfig<S extends z.ZodType, R> {
  /** Zod schema for the input (a plain object, or form data). */
  input: S;
  /** The roles that may run the action. */
  roles: readonly Role[];
  /** The data-layer call. It receives valid input and the signed-in user. */
  run: (input: z.output<S>, user: CurrentUser) => Promise<R>;
}

/**
 * Define a Server Action (docs/CONVENTIONS.md, section 4): check the role first, validate the
 * input, run the data-layer call, and return `{ ok, data }` or `{ ok: false, error }` in the
 * one error shape. The role check comes before validation, so a stranger learns nothing about
 * the input.
 *
 * Not built yet, because no editable entity needs them: cache-tag refresh and the `updatedAt`
 * edit-conflict check. The first cached admin entity adds them here.
 */
export function defineAction<S extends z.ZodType, R>(
  config: ActionConfig<S, R>,
  /** Who may act. Tests pass a fixed user; the default reads the request. */
  getUser: (roles: readonly Role[]) => Promise<CurrentUser> = requireRequestUser,
) {
  return async (raw: unknown): Promise<ActionResult<R>> => {
    try {
      const user = await getUser(config.roles);
      const data = raw instanceof FormData ? Object.fromEntries(raw) : raw;
      const input = config.input.parse(data);
      return { ok: true, data: await config.run(input, user) };
    } catch (err) {
      return { ok: false, error: toErrorBody(err).body.error };
    }
  };
}
