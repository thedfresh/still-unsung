"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";

type NavItem = { href: string; label: string };

/**
 * The main navigation. From the medium width up it is a row of links. On a phone the links sit
 * behind a menu button. The button works by keyboard: Enter or Space opens it, Escape closes it
 * and puts focus back on the button. A closed menu is hidden, so its links leave the tab order.
 */
export function SiteNav({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  // The menu is open for the page it was opened on, so a new page closes it.
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <nav
      aria-label="Main"
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="main-menu"
        onClick={() => setOpen(!open)}
        className="flex min-h-11 min-w-11 items-center justify-center rounded-control text-body md:hidden"
      >
        <span className="sr-only">Menu</span>
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor">
          <path d="M4 6h16M4 12h16M4 18h16" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </button>
      <ul
        id="main-menu"
        className={`${open ? "flex" : "hidden"} absolute right-0 top-full z-10 mt-2 min-w-48 flex-col gap-1 rounded-card border border-line bg-paper p-2 shadow-raised md:static md:mt-0 md:flex md:min-w-0 md:flex-row md:gap-8 md:border-0 md:p-0 md:shadow-none`}
      >
        {items.map((item) => {
          const current = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={`flex min-h-11 items-center px-2 text-small font-medium hover:text-gold-darker md:min-h-0 md:px-0 ${
                  current ? "font-semibold text-gold-darker" : "text-body"
                }`}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
