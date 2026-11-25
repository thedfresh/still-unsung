"use client";

import { useActionState } from "react";

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
      <h2 className="text-xl font-semibold">Make a token</h2>
      <label className="flex flex-col gap-1">
        Agent user
        <select name="userId" required className="rounded border border-current px-2 py-1">
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.email}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1">
        Label
        <input name="label" required maxLength={100} className="rounded border border-current px-2 py-1" />
      </label>
      <button type="submit" disabled={pending} className="self-start rounded border border-current px-4 py-2">
        {pending ? "Making the token…" : "Make token"}
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
      {state.token ? (
        <div role="status" className="rounded border border-current p-3">
          <p>Copy this token now. It is shown once and cannot be read again.</p>
          <code className="break-all" data-testid="new-token">
            {state.token}
          </code>
        </div>
      ) : null}
    </form>
  );
}
