import { describe, expect, it } from "vitest";
import { pickEntitlementRow } from "../tables";

const pack = { id: "pack", source: "contract", limits: { pay: "credits" } };
const gift = { id: "gift", source: "comp", limits: {} };
const older = { id: "older", source: "contract", limits: { posts: 5 } };
const badPay = { id: "bad", source: "contract", limits: { pay: "Credits" } };
const compPay = { id: "comp-pay", source: "comp", limits: { pay: "credits" } };

describe("which live row decides (rows arrive oldest first)", () => {
  it("a row that covers the use wins over an older credit-pack row, so a gift is never charged to the wallet", () => {
    expect(pickEntitlementRow([pack, gift])).toBe(gift);
    expect(pickEntitlementRow([gift, pack])).toBe(gift);
  });
  it("a malformed pay marker never hides a valid row", () => {
    expect(pickEntitlementRow([badPay, gift])).toBe(gift);
    expect(pickEntitlementRow([badPay, pack])).toBe(pack);
    expect(pickEntitlementRow([compPay, pack])).toBe(pack);
    expect(pickEntitlementRow([badPay])).toBe(badPay); // alone it is still picked, and can() refuses it
  });

  it("among covering rows the oldest decides, as before; a pack row alone decides; none is null", () => {
    expect(pickEntitlementRow([older, gift])).toBe(older);
    expect(pickEntitlementRow([pack])).toBe(pack);
    expect(pickEntitlementRow([])).toBeNull();
  });
});
