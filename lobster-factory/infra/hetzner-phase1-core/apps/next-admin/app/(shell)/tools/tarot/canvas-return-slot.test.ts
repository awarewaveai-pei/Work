import { describe, expect, it } from "vitest";
import { deckReturnIndex, deckSlot } from "./canvas-return-slot";

const batch = [{ status: "done" }, { status: "pending" }, { status: "done" }];

describe("tarot 傳回 deck slot", () => {
  it("same deck, card done -> that card", () => {
    expect(deckReturnIndex(deckSlot(4, 2), 4, batch)).toBe(2);
  });
  it("deck replaced since sending -> null (My Designs)", () => {
    expect(deckReturnIndex(deckSlot(3, 2), 4, batch)).toBeNull();
  });
  it("card not done (regenerating) or gone -> null", () => {
    expect(deckReturnIndex(deckSlot(4, 1), 4, batch)).toBeNull();
    expect(deckReturnIndex(deckSlot(4, 9), 4, batch)).toBeNull();
    expect(deckReturnIndex("preview", 4, batch)).toBeNull();
  });
});
