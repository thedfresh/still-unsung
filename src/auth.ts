import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Passkey from "next-auth/providers/passkey";
import { createClosedAdapter } from "@/lib/data/auth-adapter";
import { allowSignIn } from "@/lib/sign-in-policy";

/**
 * Sign-in with Google or a passkey, with Auth.js. Sessions live in the database.
 * Sign-up is closed (see `createClosedAdapter`): the first admin comes from `npm run db:create-admin`
 * and later users from the admin user list.
 *
 * Read the signed-in user only through `getCurrentUser` in `src/lib/current-user.ts`, never from
 * `auth()` directly.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: createClosedAdapter(),
  session: { strategy: "database", maxAge: 60 * 60 * 24 * 14, updateAge: 60 * 60 * 24 },
  providers: [
    // Google is trusted for the email, so the first Google sign-in links to the user the admin
    // added. `signIn` below refuses an address Google has not verified.
    Google({
      allowDangerousEmailAccountLinking: true,
      // Tests only: the browser tests point Google at a fake. Never set this in staging or prod.
      ...(process.env.AUTH_GOOGLE_ISSUER ? { issuer: process.env.AUTH_GOOGLE_ISSUER } : {}),
    }),
    Passkey,
  ],
  experimental: { enableWebAuthn: true },
  pages: { signIn: "/admin/sign-in", error: "/admin/sign-in" },
  callbacks: {
    signIn: ({ account, profile }) => allowSignIn(account, profile),
  },
}));
