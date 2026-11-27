/**
 * Site-wide branding and navigation, in one place. The name is not final (branding is not
 * decided), so no other file may write it out.
 */
export const SITE_NAME = "StillUnsung";
export const SITE_DESCRIPTION = "The Robert Hunter Performance Archive";

/** The license line in the footer. */
export const LICENSE_TEXT = "CC BY 4.0, except where noted";
export const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

/** The main navigation. Each page adds its link here when it exists. */
export const MAIN_NAV: readonly { href: string; label: string }[] = [{ href: "/", label: "Home" }];
