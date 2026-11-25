import { describe, expect, it } from "vitest";
import { allowSignIn } from "./sign-in-policy";

describe("allowSignIn", () => {
  it("accepts a Google account with a verified email", () => {
    expect(allowSignIn({ provider: "google" }, { email_verified: true })).toBe(true);
  });

  it("refuses a Google account whose email Google did not verify", () => {
    expect(allowSignIn({ provider: "google" }, { email_verified: false })).toBe(false);
    expect(allowSignIn({ provider: "google" }, {})).toBe(false);
    expect(allowSignIn({ provider: "google" }, null)).toBe(false);
  });

  it("leaves other providers, such as passkeys, to the adapter", () => {
    expect(allowSignIn({ provider: "passkey" }, null)).toBe(true);
  });
});
