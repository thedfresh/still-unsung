import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "@auth/core/adapters";
import { getPrisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/data/users";

/**
 * The Auth.js adapter, with sign-up closed. Only an email that already has a `users` row can
 * sign in. The adapter's `createUser` is the one place Auth.js writes a new user, so it
 * refuses here: nobody unknown gets a row, whatever the sign-in method.
 */
export function createClosedAdapter(): Adapter {
  const base = PrismaAdapter(getPrisma());
  return {
    ...base,
    createUser: async () => {
      throw new Error("Sign-up is closed: only an existing user can sign in.");
    },
    getUserByEmail: (email) => base.getUserByEmail!(normalizeEmail(email)),
  };
}
