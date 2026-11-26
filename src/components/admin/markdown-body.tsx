import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const CELL = "border border-current px-2 py-1 text-left align-top";

/** Headings start at level 2, because the page already has its level 1 heading. */
const components = {
  h1: (props: ComponentPropsWithoutRef<"h2">) => <h2 className="mt-4 text-xl font-semibold" {...props} />,
  h2: (props: ComponentPropsWithoutRef<"h3">) => <h3 className="mt-4 text-lg font-semibold" {...props} />,
  h3: (props: ComponentPropsWithoutRef<"h4">) => <h4 className="mt-3 font-semibold" {...props} />,
  h4: (props: ComponentPropsWithoutRef<"h5">) => <h5 className="mt-3 font-semibold" {...props} />,
  h5: (props: ComponentPropsWithoutRef<"h6">) => <h6 className="mt-3 font-semibold" {...props} />,
  h6: (props: ComponentPropsWithoutRef<"h6">) => <h6 className="mt-3 font-semibold" {...props} />,
  ul: (props: ComponentPropsWithoutRef<"ul">) => <ul className="list-disc pl-6" {...props} />,
  ol: (props: ComponentPropsWithoutRef<"ol">) => <ol className="list-decimal pl-6" {...props} />,
  code: (props: ComponentPropsWithoutRef<"code">) => <code className="break-words rounded bg-black/10 px-1 font-mono text-sm" {...props} />,
  pre: (props: ComponentPropsWithoutRef<"pre">) => (
    <pre className="overflow-x-auto rounded border border-current p-3" tabIndex={0}>
      {props.children}
    </pre>
  ),
  table: (props: ComponentPropsWithoutRef<"table">) => (
    <div className="overflow-x-auto" role="region" aria-label="Table" tabIndex={0}>
      <table className="border-collapse" {...props} />
    </div>
  ),
  th: (props: ComponentPropsWithoutRef<"th">) => <th className={CELL} {...props} />,
  td: (props: ComponentPropsWithoutRef<"td">) => <td className={CELL} {...props} />,
  // A body never makes a live link or image in the admin: both show as text.
  a: ({ children }: ComponentPropsWithoutRef<"a">) => <span className="underline">{children}</span>,
  img: ({ alt }: ComponentPropsWithoutRef<"img">) => <span>{alt}</span>,
};

/** Markdown as formatted text. Raw HTML in the source is not parsed: it shows as plain text. */
export function MarkdownBody({ source }: { source: string }) {
  return (
    <div className="flex flex-col gap-3 break-words">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
