import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { signOut } from "@/auth";
import { Button, PageHeader } from "@/components/admin/ui/components";
import { ADMIN_NAV } from "@/lib/admin-nav";
import { getCurrentUser } from "@/lib/current-user";
import { AppError } from "@/lib/errors";
import type { CurrentUser } from "@/lib/roles";

const NAV_LINK =
  "inline-flex min-h-11 items-center font-semibold text-body underline-offset-4 hover:text-gold-darker hover:underline";

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
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-col gap-3 border-b-2 border-line pb-4">
        <nav aria-label="Admin" className="flex flex-wrap gap-x-4 gap-y-0">
          <Link href="/admin" className={NAV_LINK}>
            Admin home
          </Link>
          {ADMIN_NAV.filter((item) => item.href !== "/admin/changes/pending").map((item) => (
            <Link key={item.href} href={item.href} className={NAV_LINK}>
              {item.label}
            </Link>
          ))}
        </nav>
        <PageHeader title={title} />
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/admin/sign-in" });
          }}
          className="flex flex-wrap items-center gap-3 text-small text-muted"
        >
          <span>Signed in as {user.email}</span>
          <Button type="submit">Sign out</Button>
        </form>
      </header>
      {children}
    </main>
  );
}
