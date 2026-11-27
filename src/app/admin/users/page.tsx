import { Suspense } from "react";
import { AdminShell, requireAdminPage } from "@/components/admin/admin-shell";
import { Button, DataTable, Field, Message, Td, Th } from "@/components/admin/ui/components";
import { INPUT_CLASS } from "@/components/admin/ui/styles";
import { listUsers } from "@/lib/data/users";
import { ROLES } from "@/lib/roles";
import { addUserAction, removeUserAction } from "./actions";

export const metadata = { title: "Users" };

const ERRORS: Record<string, string> = {
  invalid_input: "Check the email and the role.",
  conflict: "This email is taken, the user has recorded changes, or you tried to remove the last admin or yourself.",
  forbidden: "You do not have permission to do this.",
  unauthorized: "Sign in again.",
};

async function Users({ error }: { error: Promise<string | undefined> }) {
  // Sign-in first: nothing is read before this call.
  await requireAdminPage();
  const code = await error;
  const users = await listUsers();
  return (
    <AdminShell title="Users">
      {code ? (
        <Message tone="error">{ERRORS[code] ?? "Something went wrong."}</Message>
      ) : null}
      <p>Only these users can sign in. Sign-up is closed.</p>
      <DataTable label="Users">
        <caption className="sr-only">Users</caption>
        <thead>
          <tr>
            <Th scope="col">Email</Th>
            <Th scope="col">Role</Th>
            <Th scope="col">Remove</Th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <Td className="break-all">{user.email}</Td>
              <Td>{user.role}</Td>
              <Td>
                <form action={removeUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <Button type="submit" variant="danger">
                    Remove<span className="sr-only"> {user.email}</span>
                  </Button>
                </form>
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
      <form action={addUserAction} className="flex flex-col gap-3">
        <h2 className="text-lead font-semibold">Add a user</h2>
        <Field label="Email">
          <input name="email" type="email" required autoComplete="off" className={INPUT_CLASS} />
        </Field>
        <Field label="Role">
          <select name="role" required className={INPUT_CLASS}>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" variant="primary" className="self-start">
          Add user
        </Button>
      </form>
    </AdminShell>
  );
}

export default function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const error = searchParams.then((p) => (typeof p.error === "string" ? p.error : undefined));
  return (
    <Suspense fallback={<p className="p-8">Loading…</p>}>
      <Users error={error} />
    </Suspense>
  );
}
