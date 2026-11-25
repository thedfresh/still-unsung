import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { TokenForm } from "@/components/admin/token-form";
import { listAgentTokens } from "@/lib/data/agent-tokens";
import { listUsers } from "@/lib/data/users";
import { createTokenAction, revokeTokenAction } from "./actions";

export const metadata = { title: "Agent tokens" };

const ERRORS: Record<string, string> = {
  not_found: "That token does not exist.",
  forbidden: "You do not have permission to do this.",
  unauthorized: "Sign in again.",
};

function formatDate(date: Date | null): string {
  return date ? date.toISOString().slice(0, 16).replace("T", " ") + " UTC" : "never";
}

async function Tokens({ error }: { error: Promise<string | undefined> }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const code = await error;
  const [tokens, users] = await Promise.all([listAgentTokens(), listUsers()]);
  const agents = users.filter((user) => user.role === "AGENT").map(({ id, email }) => ({ id, email }));
  return (
    <AdminShell title="Agent tokens">
      {code ? (
        <p role="alert" className="rounded border border-current p-3">
          {ERRORS[code] ?? "Something went wrong."}
        </p>
      ) : null}
      <p>An agent signs in with a token. A token acts as its agent user and never as an admin.</p>
      <TokenForm action={createTokenAction} agents={agents} />
      <table className="w-full text-left">
        <caption className="sr-only">Tokens</caption>
        <thead>
          <tr>
            <th scope="col">Label</th>
            <th scope="col">User</th>
            <th scope="col">Last used</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.id}>
              <td>{token.label}</td>
              <td className="break-all">{token.userEmail}</td>
              <td>{formatDate(token.lastUsedAt)}</td>
              <td>
                {token.revokedAt ? (
                  "Revoked"
                ) : (
                  <form action={revokeTokenAction}>
                    <input type="hidden" name="tokenId" value={token.id} />
                    <button type="submit" className="rounded border border-current px-2 py-1">
                      Revoke<span className="sr-only"> {token.label}</span>
                    </button>
                  </form>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </AdminShell>
  );
}

export default function TokensPage({ searchParams }: PageProps<"/admin/tokens">) {
  const error = searchParams.then((p) => (typeof p.error === "string" ? p.error : undefined));
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Tokens error={error} />
    </Suspense>
  );
}
