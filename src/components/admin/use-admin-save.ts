"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/actions";
import type { SaveConflict, SaveInput, SaveResult } from "@/lib/data/changes/admin-save";

type SaveAction = (input: SaveInput) => Promise<ActionResult<SaveResult>>;

export interface AdminSave {
  /** True while a save runs. Disable the Save button and show "Saving…". */
  pending: boolean;
  /** Plain messages for a `role="alert"` region. Empty when there is no problem. */
  messages: string[];
  /** Both versions of each record that moved on. Empty unless there was a version conflict. */
  conflicts: SaveConflict[];
  /** Start a save. `onSaved` runs after a successful one. The page refreshes first, so the form gets the new `rev`. */
  save: (input: SaveInput, onSaved?: () => void) => void;
  clear: () => void;
}

/**
 * The state of one admin save: pending, messages and conflicts. Every edit form uses it, so no
 * form writes its own save logic. After a save the page refreshes and gives the form the new
 * `rev` (docs/CONVENTIONS.md, section 12).
 */
export function useAdminSave(action: SaveAction): AdminSave {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [messages, setMessages] = useState<string[]>([]);
  const [conflicts, setConflicts] = useState<SaveConflict[]>([]);

  const clear = () => {
    setMessages([]);
    setConflicts([]);
  };

  const save: AdminSave["save"] = (input, onSaved) => {
    clear();
    startTransition(async () => {
      const result = await action(input);
      if (!result.ok) {
        const fieldMessages = Object.values(result.error.fields ?? {}).flat();
        setMessages(fieldMessages.length > 0 ? fieldMessages : [result.error.message]);
        return;
      }
      if (result.data.status === "saved") {
        router.refresh();
        onSaved?.();
        return;
      }
      setMessages(result.data.messages);
      if (result.data.status === "conflict") setConflicts(result.data.conflicts);
    });
  };

  return { pending, messages, conflicts, save, clear };
}
