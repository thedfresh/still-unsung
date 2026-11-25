import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/roles";

/** The admin page user: an ADMIN who signed in with a session. Anyone else leaves the page. */
export async function requireAdminPage(): Promise<CurrentUser> {
  let user: CurrentUser | null = null;
  try {
    user = await getCurrentUser();
  } catch (err) {
    if (!(err instanceof AppError)) throw err;
  }
  if (!user) redirect("/admin/sign-in");
  // A token never opens an admin page; the admin pages are for people.
  if (user.role !== "ADMIN" || user.via !== "session") redirect("/admin/sign-in?error=AccessDenied");
  return user;
}

/** The frame of every admin page: heading, navigation and the sign-out button. */
export async function AdminShell({ title, children }: { title: string; children: ReactNode }) {
  const user = await requireAdminPage();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-3">
        <nav aria-label="Admin" className="flex flex-wrap gap-4 underline">
          <Link href="/admin">Admin home</Link>
          <Link href="/admin/users">Users</Link>
          <Link href="/admin/tokens">Agent tokens</Link>
        </nav>
        <h1 className="text-2xl font-semibold">{title}</h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/sign-in" });
          }}
          className="flex flex-wrap items-center gap-3"
        >
          <span>Signed in as {user.email}</span>
          <button type="submit" className="rounded border border-current px-3 py-1">
            Sign out
          </button>
        </form>
      </header>
      {children}
    </main>
  );
}
