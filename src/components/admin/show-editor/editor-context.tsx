"use client";

import { createContext, useContext } from "react";
import { BUTTON_CLASS, CHOICE_CLASS, CHOICE_INPUT_CLASS, FIELD_CLASS, INPUT_CLASS, ROW_CLASS } from "@/components/admin/ui/styles";
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

export const BUTTON = BUTTON_CLASS.secondary;
export const INPUT = INPUT_CLASS;
export const SECTION_CARD = ROW_CLASS;
export const PRIMARY = BUTTON_CLASS.primary;
export const FIELD = FIELD_CLASS;
export const CHOICE = CHOICE_CLASS;
export const CHOICE_INPUT = CHOICE_INPUT_CLASS;
