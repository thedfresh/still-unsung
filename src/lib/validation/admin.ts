import { z } from "zod";
import { idSchema } from "@/lib/ids";
import { ROLES } from "@/lib/roles";

/** Add a user who may sign in. */
export const addUserSchema = z.object({
  email: z.email("Enter a valid email address.").max(254),
  role: z.enum(ROLES, "Choose a role."),
  name: z.string().trim().max(100).optional(),
});

export const removeUserSchema = z.object({ userId: z.string().min(1).max(64) });

/** Make an agent access token. */
export const createTokenSchema = z.object({
  userId: z.string().min(1).max(64),
  label: z.string().trim().min(1, "Enter a label.").max(100),
});

export const revokeTokenSchema = z.object({ tokenId: idSchema });
