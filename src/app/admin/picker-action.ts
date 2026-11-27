"use server";

import { z } from "zod";
import { defineAction, type ActionResult } from "@/lib/actions";
import { PICKER_KINDS, searchPicker, type PickerChoice, type PickerKind } from "@/lib/data/picker";

const search = defineAction({
  input: z.object({ kind: z.enum(PICKER_KINDS), q: z.string().max(100) }),
  roles: ["ADMIN"],
  run: (input) => searchPicker(input.kind, input.q),
});

/** The Server Action behind the record pickers of the admin editors. Read-only; ADMIN only. */
export async function searchPickerAction(input: { kind: PickerKind; q: string }): Promise<ActionResult<PickerChoice[]>> {
  return search(input);
}
