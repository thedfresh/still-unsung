"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { defineAction } from "@/lib/actions";
import { createAgentToken, revokeAgentToken } from "@/lib/data/agent-tokens";
import type { CreateTokenState } from "@/components/admin/token-form";
import { createTokenSchema, revokeTokenSchema } from "@/lib/validation/admin";

const create = defineAction({
  input: createTokenSchema,
  roles: ["ADMIN"],
  run: (input) => createAgentToken(input.userId, input.label),
});

const revoke = defineAction({
  input: revokeTokenSchema,
  roles: ["ADMIN"],
  run: (input) => revokeAgentToken(input.tokenId),
});

/** Make a token and return it once. The page never stores it and cannot show it again. */
export async function createTokenAction(_previous: CreateTokenState, formData: FormData): Promise<CreateTokenState> {
  const result = await create(formData);
  if (!result.ok) return { error: result.error.fields?.label?.[0] ?? result.error.message };
  revalidatePath("/admin/tokens");
  return { token: result.data.token };
}

export async function revokeTokenAction(formData: FormData): Promise<void> {
  const result = await revoke(formData);
  redirect(result.ok ? "/admin/tokens" : `/admin/tokens?error=${result.error.code}`);
}
