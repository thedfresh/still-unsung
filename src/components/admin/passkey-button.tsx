"use client";

import { signIn } from "next-auth/webauthn";
import { useState } from "react";
import { Button, Message } from "@/components/admin/ui/components";

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
      <Button onClick={start} className="w-full justify-start text-left">
        {children}
      </Button>
      {failed ? <Message tone="error">The passkey was not accepted. Try again, or use Google.</Message> : null}
    </div>
  );
}
