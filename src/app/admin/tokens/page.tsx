import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { TokenForm } from "@/components/admin/token-form";
import { Badge, Button, DataTable, Message, Td, Th } from "@/components/admin/ui/components";
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
        <Message tone="error">{ERRORS[code] ?? "Something went wrong."}</Message>
      ) : null}
      <p>An agent signs in with a token. A token acts as its agent user and never as an admin.</p>
      <TokenForm action={createTokenAction} agents={agents} />
      <DataTable label="Tokens">
        <caption className="sr-only">Tokens</caption>
        <thead>
          <tr>
            <Th scope="col">Label</Th>
            <Th scope="col">User</Th>
            <Th scope="col">Last used</Th>
            <Th scope="col">Status</Th>
          </tr>
        </thead>
        <tbody>
          {tokens.map((token) => (
            <tr key={token.id}>
              <Td>{token.label}</Td>
              <Td className="break-all">{token.userEmail}</Td>
              <Td>{formatDate(token.lastUsedAt)}</Td>
              <Td>
                {token.revokedAt ? (
                  <Badge tone="warning">Revoked</Badge>
                ) : (
                  <form action={revokeTokenAction}>
                    <input type="hidden" name="tokenId" value={token.id} />
                    <Button type="submit" variant="danger">
                      Revoke<span className="sr-only"> {token.label}</span>
                    </Button>
                  </form>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
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
