import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineAction } from "./actions";
import { AppError } from "./errors";
import { assertRole, type CurrentUser } from "./roles";

const agent: CurrentUser = { id: "a", email: "a@example.test", name: null, role: "AGENT", via: "token" };
const admin: CurrentUser = { id: "b", email: "b@example.test", name: null, role: "ADMIN", via: "session" };

/** The role check of the real `requireUser`, with a fixed signed-in user. */
const as = (user: CurrentUser | null) => async (roles: readonly ("ADMIN" | "AGENT")[]) => assertRole(user, roles);

describe("defineAction", () => {
  const input = z.object({ name: z.string().min(1, "Enter a name.") });

  it("runs the call for an allowed role", async () => {
    const run = vi.fn(async (value: { name: string }) => value.name);
    const action = defineAction({ input, roles: ["ADMIN"], run }, as(admin));
    expect(await action({ name: "x" })).toEqual({ ok: true, data: "x" });
    expect(run).toHaveBeenCalledWith({ name: "x" }, admin);
  });

  it("refuses a request with no user and does not run the call", async () => {
    const run = vi.fn();
    const result = await defineAction({ input, roles: ["ADMIN"], run }, as(null))({ name: "x" });
    expect(result).toMatchObject({ ok: false, error: { code: "unauthorized" } });
    expect(run).not.toHaveBeenCalled();
  });

  it("refuses the wrong role and does not run the call", async () => {
    const run = vi.fn();
    const result = await defineAction({ input, roles: ["ADMIN"], run }, as(agent))({ name: "x" });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
    expect(run).not.toHaveBeenCalled();
  });

  it("checks the role before it reads the input", async () => {
    const result = await defineAction({ input, roles: ["ADMIN"], run: vi.fn() }, as(agent))({ name: "" });
    expect(result).toMatchObject({ ok: false, error: { code: "forbidden" } });
  });

  it("reports bad input with field errors, and reads form data", async () => {
    const action = defineAction({ input, roles: ["ADMIN"], run: vi.fn() }, as(admin));
    const form = new FormData();
    form.set("name", "");
    expect(await action(form)).toMatchObject({
      ok: false,
      error: { code: "invalid_input", fields: { name: ["Enter a name."] } },
    });
  });

  it("returns an AppError from the call in the one error shape", async () => {
    const action = defineAction(
      { input, roles: ["ADMIN"], run: async () => { throw new AppError("conflict", "Taken."); } },
      as(admin),
    );
    expect(await action({ name: "x" })).toEqual({ ok: false, error: { code: "conflict", message: "Taken." } });
  });
});
