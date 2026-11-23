// K22: the article page's 「本次費用」 is read by the operator, so it shows NT$ (usdToNtd, the repo's one rate), never US$.
import { describe, expect, it } from "vitest";
import { fmt } from "../CostChip";

describe("CostChip amounts", () => {
  it("shows NT$ converted by usdToNtd", () => {
    expect(fmt(0.0613)).toBe("NT$1.96");
    expect(fmt(0)).toBe("NT$0");
    expect(fmt(0.0001)).toBe("< NT$0.01");
  });
});
