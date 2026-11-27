import { describe, expect, it } from "vitest";
import { buildReadout, type LinkInfo, type ParentInfo, type ReadoutItem } from "@/lib/changes/readout";
import { storedReadoutItem } from "@/lib/changes/readout-stored";

const show: ParentInfo = { key: "Show:1", type: "Show", label: "Show 1980-11-14, WHFS-FM Studio" };
const link = (type: string, name: string): LinkInfo => ({ type, label: `${type} "${name}"`, name, isNew: false });
const cardsOf = (items: ReadoutItem[]) => buildReadout(items).groups.flatMap((g) => g.cards);

function update(type: string, label: string, before: Record<string, unknown>, after: Record<string, unknown>, links = { before: {}, after: {} }, parent: ParentInfo | null = null): ReadoutItem {
  return { op: "update", type, label, before: { id: 1, ...before }, after: { id: 1, ...after }, links, parent };
}

describe("links to records in the readout (HSA-186)", () => {
  it("links the heading of a show and both records of a moved link", () => {
    const changed = update(
      "Segment",
      "Ripple, 1980-11-14",
      { workId: 7 },
      { workId: 8 },
      { before: { workId: link("Work", "Ripple") }, after: { workId: link("Work", "Terrapin Station") } },
      show,
    );
    const readout = buildReadout([changed]);
    expect(readout.groups[0].href).toBe("/admin/shows/1");
    // A segment has no admin page yet: plain text until it arrives.
    expect(readout.groups[0].cards[0].href).toBeUndefined();
    expect(readout.groups[0].cards[0].fields[0].links).toEqual([
      { text: "Ripple", href: "/admin/works/7" },
      { text: "Terrapin Station", href: "/admin/works/8" },
    ]);
  });

  it("links a changed show and the work that a new segment names", () => {
    const [card] = cardsOf([update("Show", "Show 1980-11-14", { timeLabel: "Early" }, { timeLabel: "Late" })]);
    expect(card.href).toBe("/admin/shows/1");
    const created: ReadoutItem = {
      op: "create",
      type: "Segment",
      label: "Ripple",
      before: null,
      after: { id: 12, workId: 7 },
      links: { before: {}, after: { workId: link("Work", "Ripple") } },
      parent: show,
    };
    expect(cardsOf([created])[0].fields[0].links).toEqual([{ text: "Ripple", href: "/admin/works/7" }]);
  });

  it("links a new record only once its changeset is stored", () => {
    const parent: ParentInfo = { key: "Person:30", type: "Person", label: 'Person "Walter Scott"' };
    const person: ReadoutItem = { op: "create", type: "Person", label: parent.label, before: null, after: { id: 30, name: "Walter Scott" }, links: { before: {}, after: {} }, parent };
    expect(buildReadout([person]).groups[0].href).toBeUndefined();
    expect(buildReadout([person]).groups[0].cards[0].href).toBeUndefined();
    const stored = storedReadoutItem({ type: person.type, label: person.label, action: "CREATE", before: null, after: person.after, detail: { links: person.links, parent } });
    expect(buildReadout([stored]).groups[0].cards[0].href).toBe("/admin/people/30");
    expect(buildReadout([stored]).groups[0].href).toBe("/admin/people/30");
  });

  it("does not link a link to a deleted record", () => {
    const gone: LinkInfo = { type: "Work", label: "", name: "", isNew: false, deleted: true };
    const [card] = cardsOf([update("Segment", "x", { workId: 7 }, { workId: 8 }, { before: { workId: gone }, after: { workId: link("Work", "Ripple") } })]);
    expect(card.fields[0].links).toEqual([{ text: "Ripple", href: "/admin/works/8" }]);
  });
});
