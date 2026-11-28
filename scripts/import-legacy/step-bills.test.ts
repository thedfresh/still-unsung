import { describe, expect, it } from "vitest";
import { BILL_ACTS, BILL_OVERRIDES, FESTIVAL_EDITIONS } from "./name-fixes.ts";
import { actKey, readBill } from "./step-bills.ts";

describe("readBill (data-model item 124)", () => {
  it("reads 'Opened for X' from the billing field: X headlines, the show's act opens", () => {
    expect(readBill("Opened for the Jerry Garcia Band", null)).toEqual([
      { act: "jerry garcia band", role: "HEADLINER" },
      { act: "show", role: "OPENER" },
    ]);
    expect(readBill("Comfort opened for Robert Palmer", null)?.[0]).toEqual({ act: "robert palmer", role: "HEADLINER" });
    expect(readBill('Opened for The Other Ones at the "Terrapin Station Reunion"', null)?.[0].act).toBe("other ones");
  });

  it("reads the notes when the billing field is empty", () => {
    expect(readBill(null, "Contributor: DeadBase IX. Comments: Opened for the Jerry Garcia Band. *With JGB.")?.[0].act).toBe("jerry garcia band");
  });

  it("makes a set break for 'Performed between X sets'", () => {
    expect(readBill("Performed between The Other Ones sets", null)).toEqual([
      { act: "other ones", role: "HEADLINER" },
      { act: "show", role: "SET_BREAK" },
    ]);
  });

  it("lets 'between X and Y's sets' in the notes win over 'Opened for' in the billing field", () => {
    expect(readBill("Opened for The Dead", "Notes: (performed between Bob Dylan and The Dead's sets)")).toEqual([
      { act: "bob dylan", role: "HEADLINER" },
      { act: "show", role: "SET_BREAK" },
      { act: "dead", role: "HEADLINER" },
    ]);
  });

  it("reads no bill from a billed name or a festival name", () => {
    expect(readBill('Robert Hunter & Barry Melton "The Fish"', null)).toBeNull();
    expect(readBill("Furthur Festival", null)).toBeNull();
  });
});

describe("the reviewed bill lists", () => {
  it("names only acts that are on the reviewed list", () => {
    const keys = [
      ...[...BILL_OVERRIDES.values()].flat().map((r) => r.act).filter((a) => a !== "show"),
      ...[...FESTIVAL_EDITIONS.values()].flatMap((e) => e.bill ?? []),
    ];
    for (const key of keys) expect(BILL_ACTS.has(key)).toBe(true);
  });

  it("keys each act as actKey writes it", () => {
    for (const key of BILL_ACTS.keys()) expect(actKey(key)).toBe(key);
  });
});
