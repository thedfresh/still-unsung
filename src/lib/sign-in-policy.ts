/**
 * The sign-in rule beyond "the user exists" (the closed adapter checks that). A Google account
 * signs in only when Google says it verified the email, because the first Google sign-in
 * links to the user the admin added by email.
 */
export function allowSignIn(
  account: { provider?: string } | null | undefined,
  profile: { email_verified?: unknown } | null | undefined,
): boolean {
  if (account?.provider === "google") return profile?.email_verified === true;
  return true;
}
