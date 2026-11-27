import type { SaveConflict } from "@/lib/data/changes/admin-save";

function Lines({ lines }: { lines: SaveConflict["yours"] }) {
  return (
    <ul>
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
    <div role="alert" className="flex flex-col gap-2 rounded border border-current p-3">
      {messages.map((message) => (
        <p key={message}>{message}</p>
      ))}
      {conflicts.map((conflict) => (
        <div key={conflict.record}>
          <p className="font-semibold">Your version of {conflict.record}</p>
          <Lines lines={conflict.yours} />
          <p className="font-semibold">Stored version</p>
          <Lines lines={conflict.stored} />
        </div>
      ))}
    </div>
  );
}
