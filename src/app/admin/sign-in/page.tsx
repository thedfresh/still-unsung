import { redirect } from "next/navigation";
import { Suspense } from "react";
import { signIn } from "@/auth";
import { PasskeyButton } from "@/components/admin/passkey-button";
import { Button, Message } from "@/components/admin/ui/components";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import { clientKey, signInLimiter } from "@/lib/rate-limit";
import { headers } from "next/headers";

export const metadata = { title: "Sign in" };

async function signInWithGoogle() {
  "use server";
  if (!signInLimiter().hit(clientKey(await headers()))) redirect("/admin/sign-in?error=rate_limited");
  await signIn("google", { redirectTo: "/admin" });
}

const MESSAGES: Record<string, string> = {
  rate_limited: new AppError("rate_limited").message,
  AccessDenied: "This account cannot sign in. Ask an admin to add your email.",
};
const FALLBACK_MESSAGE = "Sign-in failed. Only users that an admin added can sign in.";

async function SignInForm({ error }: { error: Promise<string | undefined> }) {
  const code = await error;
  const current = await getCurrentUser().catch((err: unknown) => {
    // Only a refusal by us is "nobody". Next.js signals (dynamic data) must pass through.
    if (err instanceof AppError) return null;
    throw err;
  });
  if (current?.via === "session" && current.role === "ADMIN") redirect("/admin");
  return (
    <>
      {code ? (
        <Message tone="error">{MESSAGES[code] ?? FALLBACK_MESSAGE}</Message>
      ) : null}
      <form action={signInWithGoogle}>
        <Button type="submit" variant="primary" className="w-full justify-start text-left">
          Sign in with Google
        </Button>
      </form>
      <PasskeyButton action="authenticate">Sign in with a passkey</PasskeyButton>
    </>
  );
}

export default function SignInPage({ searchParams }: PageProps<"/admin/sign-in">) {
  const error = searchParams.then((p) => (typeof p.error === "string" ? p.error : undefined));
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-title font-semibold text-ink">Sign in</h1>
      <p>Only users that an admin added can sign in.</p>
      <Suspense fallback={<p>Loading…</p>}>
        <SignInForm error={error} />
      </Suspense>
    </main>
  );
}
