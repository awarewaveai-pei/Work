// The channel mirror (SOC-REAUTH): social_accounts.status follows Postiz's own Integration row, both ways.
import { describe, expect, it } from "vitest";
import { parseHealth, planMirror, reauthIncident, type ChannelHealth, type MirrorAccount } from "../channel-health";

const acc = (id: string, status: string): MirrorAccount => ({ id, organization_id: "org", platform: "youtube", label: "Soulful", status, postiz_integration_id: `pz-${id}` });
const h = (id: string, over: Partial<ChannelHealth> = {}): ChannelHealth =>
  ({ id: `pz-${id}`, provider: "youtube", refreshNeeded: false, disabled: false, inBetweenSteps: false, deleted: false, ...over });

describe("planMirror", () => {
  it("refreshNeeded / inBetweenSteps / disabled -> expired; healthy -> connected stays", () => {
    const got = planMirror([acc("a", "connected"), acc("b", "connected"), acc("c", "connected"), acc("d", "connected")],
      [h("a", { refreshNeeded: true }), h("b", { inBetweenSteps: true }), h("c", { disabled: true }), h("d")]);
    expect(got.map((c) => [c.account.id, c.to])).toEqual([["a", "expired"], ["b", "expired"], ["c", "expired"]]);
    expect(got[0].why).toMatch(/refreshNeeded/);
  });

  it("an expired channel Postiz says is healthy again goes back to connected", () => {
    expect(planMirror([acc("a", "expired")], [h("a")])).toEqual([{ account: acc("a", "expired"), to: "connected", why: null }]);
  });

  it("our own disabled and an already-expired unhealthy one are left alone", () => {
    expect(planMirror([acc("a", "disabled"), acc("b", "expired")], [h("a", { refreshNeeded: true }), h("b", { refreshNeeded: true })])).toEqual([]);
  });

  it("a channel missing from Postiz's table is gone; an empty table changes nothing", () => {
    expect(planMirror([acc("c", "connected")], [h("a")])).toEqual([{ account: acc("c", "connected"), to: "expired", why: "Postiz 已沒有這個頻道" }]);
    expect(planMirror([acc("c", "connected")], [])).toEqual([]);
  });

  it("the incident says which channel and what to do", () => {
    const { title, message } = reauthIncident("youtube", "Soulful", "Postiz refreshNeeded：平台授權已失效");
    expect(title).toBe("youtube 頻道需要重新授權");
    expect(message).toMatch(/\/tools\/social 設定 → 頻道.*重新連接.*重新排程/);
    expect(message).not.toMatch(/成功送出時/);
  });

  it("a malformed payload is refused whole", () => {
    expect(parseHealth([h("a")])).toEqual([h("a")]);
    expect(parseHealth([h("a"), { id: "x", provider: "y", refreshNeeded: "true" }])).toBeNull();
    expect(parseHealth({})).toBeNull();
  });
});
