"use client";

import { useActionState } from "react";
import { Button, Field, Message } from "@/components/admin/ui/components";
import { INPUT_CLASS } from "@/components/admin/ui/styles";

export interface CreateTokenState {
  /** The new token. Shown once: the server keeps only its hash. */
  token?: string;
  error?: string;
}

interface Props {
  action: (previous: CreateTokenState, formData: FormData) => Promise<CreateTokenState>;
  agents: { id: string; email: string | null }[];
}

/** Make an agent access token. The result shows the token once, with a warning to copy it. */
export function TokenForm({ action, agents }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  if (agents.length === 0) return <p>Add a user with the AGENT role first. Only an agent user can have a token.</p>;
  return (
    <form action={formAction} className="flex flex-col gap-3">
      <h2 className="text-lead font-semibold">Make a token</h2>
      <Field label="Agent user">
        <select name="userId" required className={INPUT_CLASS}>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.email}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Label">
        <input name="label" required maxLength={100} className={INPUT_CLASS} />
      </Field>
      <Button type="submit" variant="primary" busy={pending} className="self-start">
        {pending ? "Making the token…" : "Make token"}
      </Button>
      {state.error ? <Message tone="error">{state.error}</Message> : null}
      {state.token ? (
        <Message tone="success">
          <p>Copy this token now. It is shown once and cannot be read again.</p>
          <code className="break-all font-mono text-ink" data-testid="new-token">
            {state.token}
          </code>
        </Message>
      ) : null}
    </form>
  );
}
