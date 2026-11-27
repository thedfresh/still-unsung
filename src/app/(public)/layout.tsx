import type { ReactNode } from "react";
import { SiteFrame } from "@/components/ui/site-frame";

/** Every public page sits in the site frame: skip link, header, main area and footer. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return <SiteFrame>{children}</SiteFrame>;
}
