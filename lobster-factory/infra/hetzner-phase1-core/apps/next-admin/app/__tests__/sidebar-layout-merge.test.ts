import { describe, expect, it } from "vitest";
import { DEFAULT_SECTIONS, applyLayout, itemKey, mergeItemOrder } from "../sidebar-sections";

// U11: adding pages to a section keeps a staff member's own item order there; the new pages appear at their default place.
describe("saved sidebar item order + new items", () => {
  const content = DEFAULT_SECTIONS.find((s) => s.id === "content-tools")!;
  const now = content.items.map(itemKey);
  const before = now.filter((k) => k !== "/tools/content/rewrite" && k !== "/tools/content/drafts");   // the shape before U11
  const own = [...before].reverse();                                                                     // someone's own order

  it("keeps the old order and shows the new items right after the item they follow by default", () => {
    const out = applyLayout(DEFAULT_SECTIONS, { itemOrders: { "content-tools": own } }).find((s) => s.id === "content-tools")!;
    const keys = out.items.map(itemKey);
    expect(keys.filter((k) => before.includes(k))).toEqual(own);
    const at = keys.indexOf("/tools/content");
    expect(keys.slice(at, at + 3)).toEqual(["/tools/content", "/tools/content/rewrite", "/tools/content/drafts"]);
    expect(keys).toHaveLength(now.length);
  });

  it("drops saved items that are no longer in the section", () => {
    expect(mergeItemOrder(["/gone", "b", "a"], ["a", "b"])).toEqual(["b", "a"]);
  });

  it("a new first item goes first; an empty saved order is the default", () => {
    expect(mergeItemOrder(["b"], ["a", "b"])).toEqual(["a", "b"]);
    expect(applyLayout(DEFAULT_SECTIONS, { itemOrders: { "content-tools": [] } })).toEqual(DEFAULT_SECTIONS);
  });
});
