import { expect, it } from "vitest";

// Deliberately failing test (HSA-20): proves CI turns red. Reverted in the next commit.
it("fails on purpose to prove CI catches failures", () => {
  expect(1 + 1).toBe(3);
});
