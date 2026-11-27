"use client";

import { createContext, useContext } from "react";
import type { Built } from "@/lib/shows/edit-edits";

/** What every part of the show editor uses to save. The root component provides it. */
export interface EditorApi {
  /** True while a save runs: disable every control that saves. */
  pending: boolean;
  /** Save the edits with the page's evidence. `done` runs after a successful save. */
  send: (built: Built, done?: () => void) => void;
  /** Show a message in the alert region, for a mistake found before the save. */
  fail: (message: string) => void;
}

const EditorContext = createContext<EditorApi | null>(null);

export const EditorProvider = EditorContext.Provider;

export function useEditor(): EditorApi {
  const api = useContext(EditorContext);
  if (!api) throw new Error("useEditor needs the show editor around it.");
  return api;
}

export const BUTTON = "rounded border border-current px-3 py-1 disabled:opacity-60";
export const INPUT = "rounded border border-current px-2 py-1";
export const SECTION_CARD = "min-w-0 break-words rounded border border-current p-3";
