import { describe, expect, it } from "vitest";
import { addUserSchema, createTokenSchema, revokeTokenSchema } from "./admin";

describe("admin schemas", () => {
  it("accepts a valid user and refuses a bad email or role", () => {
    expect(addUserSchema.safeParse({ email: "a@example.test", role: "AGENT" }).success).toBe(true);
    expect(addUserSchema.safeParse({ email: "nope", role: "AGENT" }).success).toBe(false);
    expect(addUserSchema.safeParse({ email: "a@example.test", role: "EDITOR" }).success).toBe(false);
  });

  it("needs a label for a token", () => {
    expect(createTokenSchema.safeParse({ userId: "u1", label: "  " }).success).toBe(false);
    expect(createTokenSchema.safeParse({ userId: "u1", label: "MCP server" }).success).toBe(true);
  });

  it("parses a token id from form text", () => {
    expect(revokeTokenSchema.parse({ tokenId: "12" }).tokenId).toBe(12);
    expect(revokeTokenSchema.safeParse({ tokenId: "abc" }).success).toBe(false);
  });
});
