import { describe, expect, it } from "vitest";
import { keyBetween } from "@/lib/sort-key";

describe("keyBetween", () => {
  it("makes a key before the first, after the last and between two", () => {
    expect(keyBetween(null, "a0") < "a0").toBe(true);
    expect(keyBetween("az", null) > "az").toBe(true);
    const middle = keyBetween("a0", "a1");
    expect(middle > "a0" && middle < "a1").toBe(true);
  });
  it("keeps order over many inserts at one spot", () => {
    let low = "a0";
    const high = "a1";
    for (let i = 0; i < 40; i += 1) {
      const key = keyBetween(low, high);
      expect(key > low && key < high).toBe(true);
      low = key;
    }
  });
  it("keeps order over many inserts at the start and the end", () => {
    let first = "a5";
    for (let i = 0; i < 5; i += 1) {
      const key = keyBetween(null, first);
      expect(key < first).toBe(true);
      first = key;
    }
    let last = "a5";
    for (let i = 0; i < 30; i += 1) {
      const key = keyBetween(last, null);
      expect(key > last).toBe(true);
      last = key;
    }
  });
  it("inserts before the first key at least 50 times, from an imported key", () => {
    let first = "a0";
    for (let i = 0; i < 60; i += 1) {
      const key = keyBetween(null, first);
      expect(key < first).toBe(true);
      first = key;
    }
  });
  it("finds a key between a digit and an imported key that follows it", () => {
    const key = keyBetween("Z", "a0");
    expect(key > "Z" && key < "a0").toBe(true);
    expect(() => keyBetween(key, "a0")).not.toThrow();
  });
  it("keeps order over many inserts at random positions", () => {
    let seed = 12345;
    const random = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const keys = ["a0", "a1", "a2", "b0"];
    for (let i = 0; i < 500; i += 1) {
      const slot = Math.floor(random() * (keys.length + 1));
      const key = keyBetween(keys[slot - 1] ?? null, keys[slot] ?? null);
      keys.splice(slot, 0, key);
    }
    expect(keys).toEqual([...keys].sort());
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("refuses neighbours that are equal or out of order", () => {
    expect(() => keyBetween("a1", "a1")).toThrow();
    expect(() => keyBetween("a2", "a1")).toThrow();
  });
});
