"use client";

import { signIn } from "next-auth/webauthn";
import { useState } from "react";

/**
 * A button that starts a passkey (WebAuthn) flow. "authenticate" signs in with a passkey the
 * user has. "register" adds a passkey to the user who is already signed in; Auth.js refuses it
 * for anyone else.
 */
export function PasskeyButton({ action, children }: { action: "authenticate" | "register"; children: string }) {
  const [failed, setFailed] = useState(false);
  async function start() {
    setFailed(false);
    try {
      await signIn("passkey", { action, redirectTo: "/admin" });
    } catch {
      // The user closed the browser prompt, or no passkey matched.
      setFailed(true);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={start} className="rounded border border-current px-4 py-2 text-left">
        {children}
      </button>
      {failed ? <p role="alert">The passkey was not accepted. Try again, or use Google.</p> : null}
    </div>
  );
}
