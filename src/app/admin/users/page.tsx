import { Suspense } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
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
  const code = await error;
  const users = await listUsers();
  return (
    <AdminShell title="Users">
      {code ? (
        <p role="alert" className="rounded border border-current p-3">
          {ERRORS[code] ?? "Something went wrong."}
        </p>
      ) : null}
      <p>Only these users can sign in. Sign-up is closed.</p>
      <table className="w-full text-left">
        <caption className="sr-only">Users</caption>
        <thead>
          <tr>
            <th scope="col">Email</th>
            <th scope="col">Role</th>
            <th scope="col">Remove</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td className="break-all">{user.email}</td>
              <td>{user.role}</td>
              <td>
                <form action={removeUserAction}>
                  <input type="hidden" name="userId" value={user.id} />
                  <button type="submit" className="rounded border border-current px-2 py-1">
                    Remove<span className="sr-only"> {user.email}</span>
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form action={addUserAction} className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Add a user</h2>
        <label className="flex flex-col gap-1">
          Email
          <input name="email" type="email" required autoComplete="off" className="rounded border border-current px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Role
          <select name="role" required className="rounded border border-current px-2 py-1">
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="self-start rounded border border-current px-4 py-2">
          Add user
        </button>
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
