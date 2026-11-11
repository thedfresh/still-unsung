import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppError, errorResponse, toErrorBody } from "./errors";

describe("toErrorBody", () => {
  it("passes an AppError through with its status", () => {
    const { body, status } = toErrorBody(new AppError("not_found", "No such event."));
    expect(status).toBe(404);
    expect(body).toEqual({ error: { code: "not_found", message: "No such event." } });
  });

  it("uses a default message when an AppError has none", () => {
    const { body, status } = toErrorBody(new AppError("conflict"));
    expect(status).toBe(409);
    expect(body.error.message).toBe("This conflicts with an existing record.");
  });

  it("keeps the field errors of an AppError", () => {
    const { body } = toErrorBody(new AppError("conflict", undefined, { slug: ["Taken."] }));
    expect(body.error.fields).toEqual({ slug: ["Taken."] });
  });

  it("turns a Zod error into invalid_input with field errors", () => {
    const schema = z.object({ title: z.string().min(1, "Enter a title."), year: z.number() });
    const result = schema.safeParse({ title: "", year: "x" });
    expect(result.success).toBe(false);
    const { body, status } = toErrorBody(result.error);
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_input");
    expect(body.error.fields?.title).toEqual(["Enter a title."]);
    expect(body.error.fields?.year).toHaveLength(1);
  });

  it("hides the details of an unknown error and logs it", () => {
    const log = vi.fn();
    const secret = new Error('relation "internal_table" does not exist');
    const { body, status } = toErrorBody(secret, log);
    expect(status).toBe(500);
    expect(body).toEqual({ error: { code: "internal", message: "Something went wrong." } });
    expect(JSON.stringify(body)).not.toContain("internal_table");
    expect(log).toHaveBeenCalledWith("Unexpected error:", secret);
  });
});

describe("errorResponse", () => {
  it("returns JSON with the status and no caching", async () => {
    const res = errorResponse(new AppError("forbidden"));
    expect(res.status).toBe(403);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({
      error: { code: "forbidden", message: "You do not have permission to do this." },
    });
  });
});
