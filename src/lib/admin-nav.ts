/**
 * Every admin page, in one list. The navigation bar and the admin home both read it, so a new
 * page is one new entry. `group` orders the home page sections.
 */
export interface AdminNavItem {
  href: string;
  label: string;
  /** One plain sentence for the admin home. */
  purpose: string;
  group: "Records" | "Review" | "Settings";
}

export const ADMIN_NAV: readonly AdminNavItem[] = [
  { href: "/admin/shows", label: "Shows", purpose: "Find a show and edit its sets and segments.", group: "Records" },
  { href: "/admin/works", label: "Works", purpose: "Songs and other works, with their other names.", group: "Records" },
  { href: "/admin/people", label: "People", purpose: "Musicians, authors and contributors.", group: "Records" },
  { href: "/admin/bands", label: "Bands", purpose: "The bands that played the shows.", group: "Records" },
  { href: "/admin/places", label: "Places", purpose: "Venues and other places, with their names.", group: "Records" },
  { href: "/admin/lists", label: "Lists", purpose: "Short lists that other records pick from: set types, instruments and more.", group: "Records" },
  { href: "/admin/changes", label: "Changes", purpose: "The log of every saved change, newest first.", group: "Review" },
  { href: "/admin/changes/pending", label: "Open previews", purpose: "Changes an agent proposed and nobody applied yet.", group: "Review" },
  { href: "/admin/import-rules", label: "Import rules", purpose: "The rules an agent follows when it imports.", group: "Review" },
  { href: "/admin/users", label: "Users", purpose: "Who can sign in, and with which role.", group: "Settings" },
  { href: "/admin/tokens", label: "Agent tokens", purpose: "The access tokens of the agents.", group: "Settings" },
  { href: "/admin/design", label: "Design", purpose: "The colors, type and parts that the site uses.", group: "Settings" },
];

export const ADMIN_GROUPS: readonly AdminNavItem["group"][] = ["Records", "Review", "Settings"];
