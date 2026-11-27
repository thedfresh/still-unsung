import type { ReactNode } from "react";

/** One titled section of the component gallery. */
export function Part({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="border-b-2 border-line pb-2 text-section font-semibold">
        {title}
      </h2>
      {children}
    </section>
  );
}
