import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SiteNav } from "@/components/ui/site-nav";
import { LICENSE_TEXT, LICENSE_URL, MAIN_NAV, SITE_NAME } from "@/lib/site-config";

/** The frame of every public page: skip link, header, main area and footer. */
export function SiteFrame({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only rounded-control bg-paper px-4 py-2 font-semibold text-gold-darker focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-20 focus:shadow-raised"
      >
        Skip to main content
      </a>
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex w-full max-w-site items-center justify-between gap-6 px-4 py-3 sm:px-6">
          <Link href="/" className="text-lead font-semibold text-ink hover:text-gold-darker">
            {SITE_NAME}
          </Link>
          {/* The menu reads the path in the browser. On a page whose address is only known at request time, the plain links show first. */}
          <Suspense
            fallback={
              <nav aria-label="Main">
                <ul className="flex gap-4">
                  {MAIN_NAV.map((item) => (
                    <li key={item.href}>
                      <Link href={item.href} className="inline-flex min-h-6 items-center font-medium text-ink hover:text-gold-darker">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            }
          >
            <SiteNav items={MAIN_NAV} />
          </Suspense>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="flex flex-1 flex-col focus:outline-none">
        {children}
      </main>
      <footer className="border-t border-line bg-surface">
        <p className="mx-auto w-full max-w-site px-4 py-6 text-small text-muted sm:px-6">
          <a href={LICENSE_URL} className="underline hover:text-gold-darker">
            {LICENSE_TEXT}
          </a>
        </p>
      </footer>
    </>
  );
}
