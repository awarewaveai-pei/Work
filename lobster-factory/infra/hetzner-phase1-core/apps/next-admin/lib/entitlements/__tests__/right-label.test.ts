import { describe, expect, it } from "vitest";
import { outcomeLabel, rightLabel, SHADOW_NOTE, type RightInput } from "../right-label";

const ok = { allowed: true, verdict: true, reason: null };
const no = (reason: string) => ({ allowed: false, verdict: false, reason });
const base: RightInput = { entry: ok, source: null, door: "open", viewer: "manager", mode: "enforce" };

// One row per PLATFORM-UX-BLUEPRINT §8 state.
const rows: [string, Partial<RightInput>, { code: string | null; label: string | null; text?: string; action?: string | null }][] = [
  ["S1", { door: "not_held", productName: "內容行銷" }, { code: "S1", label: "未開通", text: "「內容行銷」尚未開通。這是加購的產品，每個功能要分開購買，或由我們贈送後才能使用。", action: "回到我的工作台" }],
  ["S2", { entry: no("no_entitlement") }, { code: "S2", label: "未開通", text: "尚未開通此功能", action: "了解" }],
  ["S3", { source: "contract" }, { code: "S3", label: "方案內", text: "方案內，不另外扣點" }],
  ["S4 with date", { source: "comp", endsAt: "2026-12-31T00:00:00Z" }, { code: "S4", label: "贈送", text: "贈送，可用到 2026-12-31" }],
  ["S4 no date", { source: "comp" }, { code: "S4", label: "贈送", text: "贈送" }],
  ["S5", { source: "credits", estimate: 12, featureName: "生成" }, { code: "S5", label: "扣點", text: "每次依用量扣點，約 12 點（NT$12）", action: "生成 · 約 12 點" }],
  ["S6", { source: "credits", estimate: 12, contractStatus: "active" }, { code: "S6", label: "扣點", text: "你的合約不含這個功能的用量，每次約 12 點（NT$12）" }],
  ["S7 numbers", { entry: no("no_credits"), estimate: 12, balance: 5 }, { code: "S7", label: "點數不足", text: "這次需要約 12 點，你有 5 點。", action: "儲值" }],
  ["S7 no numbers", { entry: no("no_credits") }, { code: "S7", label: "點數不足", text: "點數不足。" }],
  ["S7 member", { entry: no("no_credits"), viewer: "member" }, { code: "S7", label: "點數不足", action: "請通知單位管理者儲值" }],
  ["S8", { entry: no("no_entitlement"), balance: 50, featureName: "寫文章" }, { code: "S8", label: "未開通", text: "你的點數只能用在已開通的功能；「寫文章」還沒開通。", action: "開通寫文章" }],
  ["S9", { entry: no("no_entitlement"), contractStatus: "expired", balance: 30, endsAt: "2026-11-01" }, { code: "S9", label: "已到期", text: "合約已於 2026-11-01 結束，點數 30 點仍保留。", action: "續約" }],
  ["S10 trial", { source: "contract", contractStatus: "trial", endsAt: "2026-12-01" }, { code: "S10", label: "試用中", text: "試用到 2026-12-01" }],
  ["S10 past_due", { source: "contract", contractStatus: "past_due", endsAt: "2026-12-08" }, { code: "S10", label: "逾期", text: "逾期，寬限到 2026-12-08" }],
  ["S10 canceled", { source: "contract", contractStatus: "canceled" }, { code: "S10", label: "已取消", text: "已取消" }],
  ["S11", { walletHold: true }, { code: "S11", label: "處理中", text: "你的帳戶有一筆付款正在確認，確認完成前暫時不能使用點數。", action: "聯絡我們" }],
  ["S12 door", { door: "unavailable" }, { code: "S12", label: "暫時無法確認", text: "暫時無法確認開通狀態，請重新整理頁面再試一次。", action: "重新整理" }],
  ["S12 infra", { entry: no("infrastructure_error") }, { code: "S12", label: "暫時無法確認" }],
  ["S13", { comingSoon: true }, { code: "S13", label: "即將推出", text: "即將推出", action: null }],
  ["S14", { emailUnverified: true }, { code: "S14", label: null, text: "請先完成 email 確認再進入", action: "重寄確認信" }],
  ["allowed, unknown source", {}, { code: null, label: null }],
  ["entry unreadable", { entry: null }, { code: null, label: null }],
  ["back_office_only hidden", { entry: no("back_office_only") }, { code: null, label: null, text: "" }],
  ["resell hidden", { featureKey: "content.resell", source: "contract" }, { code: null, label: null }],
  ["unknown reason", { entry: no("unknown_feature") }, { code: null, label: null, text: "目前無法使用" }],
];

describe("rightLabel (B §8)", () => {
  it.each(rows)("%s", (_n, over, want) => {
    const r = rightLabel({ ...base, ...over });
    expect(r.code).toBe(want.code);
    expect(r.label).toBe(want.label);
    if (want.text !== undefined) expect(r.text).toBe(want.text);
    if (want.action !== undefined) expect(r.action).toBe(want.action);
  });

  it("S15: staff in shadow gets the small print on a labelled state, enforce does not", () => {
    expect(rightLabel({ ...base, source: "contract", viewer: "staff", mode: "shadow" }).note).toBe(SHADOW_NOTE);
    expect(rightLabel({ ...base, source: "contract", viewer: "staff", mode: "enforce" }).note).toBeNull();
    expect(rightLabel({ ...base, source: "contract", viewer: "member", mode: "shadow" }).note).toBeNull();
  });

  it("shadow: states follow verdict (enforce's answer), not the always-true allowed", () => {
    const r = rightLabel({ ...base, mode: "shadow", viewer: "staff", entry: { allowed: true, verdict: false, reason: "no_entitlement" } });
    expect(r.code).toBe("S2");
  });

  it("tones are only the five badge token names", () => {
    for (const [, over] of rows) expect(["green", "blue", "gray", "yellow", "red"]).toContain(rightLabel({ ...base, ...over }).tone);
  });
});

describe("outcomeLabel (S16a–c, S18)", () => {
  it.each([
    [{ kind: "refunded" as const }, "S16a", "這次沒有產出，點數已退回。", "再試一次"],
    [{ kind: "partial" as const, done: 3, charged: 18, failed: 2, refunded: 12 }, "S16b", "已完成 3 張，扣 18 點；2 張失敗，已退回 12 點。", "重試失敗的 2 張"],
    [{ kind: "depleted" as const, short: 7 }, "S16c", "結果已產出，但點數不夠付完整費用，已扣到 0（差 7 點）。請儲值後再繼續。", "儲值"],
    [{ kind: "updated" as const }, "S18", "已更新，最多 5 分鐘內全部功能生效。", "重新整理"],
  ])("%j", (o, code, text, action) => {
    const r = outcomeLabel(o);
    expect([r.code, r.text, r.action]).toEqual([code, text, action]);
  });
});
