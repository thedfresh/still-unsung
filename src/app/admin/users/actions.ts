"use server";

import { redirect } from "next/navigation";
import { addUser, removeUser } from "@/lib/data/users";
import { defineAction } from "@/lib/actions";
import { AppError } from "@/lib/errors";
import { addUserSchema, removeUserSchema } from "@/lib/validation/admin";

const add = defineAction({
  input: addUserSchema,
  roles: ["ADMIN"],
  run: (input) => addUser(input),
});

const remove = defineAction({
  input: removeUserSchema,
  roles: ["ADMIN"],
  run: async (input, user) => {
    if (input.userId === user.id) {
      throw new AppError("conflict", "You cannot remove your own user.");
    }
    await removeUser(input.userId);
  },
});

export async function addUserAction(formData: FormData): Promise<void> {
  const result = await add(formData);
  redirect(result.ok ? "/admin/users" : `/admin/users?error=${result.error.code}`);
}

export async function removeUserAction(formData: FormData): Promise<void> {
  const result = await remove(formData);
  redirect(result.ok ? "/admin/users" : `/admin/users?error=${result.error.code}`);
}
