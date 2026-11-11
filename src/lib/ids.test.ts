import { describe, expect, it } from "vitest";
import { MAX_ID, parseId } from "./ids";

describe("parseId", () => {
  it.each([
    [1, 1],
    ["1", 1],
    ["42", 42],
    [MAX_ID, MAX_ID],
    [String(MAX_ID), MAX_ID],
  ])("accepts %j", (input, expected) => {
    expect(parseId(input)).toBe(expected);
  });

  it.each([
    0,
    -1,
    1.5,
    MAX_ID + 1,
    Number.NaN,
    "0",
    "-1",
    "1.5",
    "1e3",
    " 7",
    "007",
    "",
    "abc",
    String(MAX_ID + 1),
    null,
    undefined,
    true,
    {},
  ])("rejects %j", (input) => {
    expect(parseId(input)).toBeNull();
  });
});
