"use server";

import { z } from "zod";
import { defineAction, type ActionResult } from "@/lib/actions";
import { saveAdminChanges, type SaveInput, type SaveResult } from "@/lib/data/changes/admin-save";

const save = defineAction({
  input: z.object({
    edits: z.array(z.unknown()),
    evidence: z.unknown(),
    isPublic: z.boolean().optional(),
  }),
  roles: ["ADMIN"],
  // The role is already checked: hand the same user on, so the save reads the request once.
  run: (input, user) => saveAdminChanges(input, async () => user),
});

/** The one Server Action every admin edit screen calls to save (docs/CONVENTIONS.md, section 12). */
export async function saveAdminChangesAction(input: SaveInput): Promise<ActionResult<SaveResult>> {
  return save(input);
}
