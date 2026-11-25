import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import { assertRole, type CurrentUser } from "./roles";

const user = (role: CurrentUser["role"]): CurrentUser => ({
  id: "u1",
  email: "a@example.test",
  name: null,
  role,
  via: "session",
});

describe("assertRole", () => {
  it("returns the user when the role is allowed", () => {
    const admin = user("ADMIN");
    expect(assertRole(admin, ["ADMIN"])).toBe(admin);
  });

  it("refuses a request with no user as unauthorized", () => {
    expect(() => assertRole(null, ["ADMIN"])).toThrow(expect.objectContaining({ code: "unauthorized" }));
  });

  it("refuses the wrong role as forbidden", () => {
    expect(() => assertRole(user("AGENT"), ["ADMIN"])).toThrow(AppError);
    expect(() => assertRole(user("AGENT"), ["ADMIN"])).toThrow(expect.objectContaining({ code: "forbidden" }));
  });
});
