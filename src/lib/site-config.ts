/**
 * Site-wide branding and navigation, in one place. The name is final. No other file writes it
 * out, so a change to it stays one edit.
 */
export const SITE_NAME = "StillUnsung";
export const SITE_DESCRIPTION = "The Robert Hunter Performance Archive";

/** The license line in the footer. */
export const LICENSE_TEXT = "CC BY 4.0, except where noted";
export const LICENSE_URL = "https://creativecommons.org/licenses/by/4.0/";

/** The main navigation. Each page adds its link here when it exists. */
export const MAIN_NAV: readonly { href: string; label: string }[] = [{ href: "/", label: "Home" }];
