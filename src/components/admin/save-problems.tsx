import { Message } from "@/components/admin/ui/components";
import type { SaveConflict } from "@/lib/data/changes/admin-save";

function Lines({ lines }: { lines: SaveConflict["yours"] }) {
  return (
    <ul className="rounded-control border border-line bg-surface p-2 text-ink">
      {lines.map((line) => (
        <li key={line.field} className="break-words">
          {line.field}: {line.value}
        </li>
      ))}
    </ul>
  );
}

/** The messages of a refused save, and both versions of a record that changed. Nothing when there is none. */
export function SaveProblems({ messages, conflicts }: { messages: string[]; conflicts: SaveConflict[] }) {
  if (messages.length === 0 && conflicts.length === 0) return null;
  return (
    <Message tone="error">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      {conflicts.map((conflict) => (
        <div key={conflict.record} className="grid gap-2 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Your version of {conflict.record}</p>
            <Lines lines={conflict.yours} />
          </div>
          <div className="flex flex-col gap-1">
            <p className="font-semibold">Stored version</p>
            <Lines lines={conflict.stored} />
          </div>
        </div>
      ))}
    </Message>
  );
}
