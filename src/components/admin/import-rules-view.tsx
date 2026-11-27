import Link from "next/link";
import { Message } from "@/components/admin/ui/components";
import { LINK_CLASS } from "@/components/admin/ui/styles";
import { MarkdownBody } from "@/components/ui/markdown-body";
import type { ImportRulesView } from "@/lib/data/guide-pages";

export const MISSING_RULES_MESSAGE =
  "The import rules page does not exist yet. An agent can create it through the tools; ask in a session.";

const utc = (date: Date) => `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;

/** The import rules as formatted text, with the version, the time of the last change and a link to it. */
export function ImportRulesPage({ rules }: { rules: ImportRulesView | null }) {
  if (!rules) return <Message tone="info">{MISSING_RULES_MESSAGE}</Message>;
  const { lastChange } = rules;
  return (
    <>
      <p>This is the text an agent receives from the server, word for word. It is private.</p>
      <dl className="flex flex-wrap gap-x-6 gap-y-1">
        <div className="flex gap-2">
          <dt className="font-semibold">Version</dt>
          <dd>{rules.rev}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Last changed</dt>
          <dd>{utc(rules.updatedAt)}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="font-semibold">Last change</dt>
          <dd>
            {lastChange ? (
              <Link href={`/admin/changes?page=${lastChange.page}#change-${lastChange.id}`} className={LINK_CLASS}>
                Read the change
              </Link>
            ) : (
              "none in the log"
            )}
          </dd>
        </div>
      </dl>
      <article aria-label={rules.title} className="flex flex-col gap-3 border-t-2 border-line pt-4">
        <MarkdownBody source={rules.body} />
      </article>
    </>
  );
}
