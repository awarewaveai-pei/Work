// The one place that words a feature's right ("方案內／贈送／扣點／未開通…"). Pure: no React, no server imports.
// States and copy: PLATFORM-UX-BLUEPRINT-20261122.md §8 (S1–S18). Callers show `label` as a badge (tone = existing badge token name),
// `text` as the sentence, `action` as the button caption. Reserved (§8.2 R1–R3, S17): no plan tiers, quotas or per-plan rates.

export type RightTone = "green" | "blue" | "gray" | "yellow" | "red";
export type RightSource = "contract" | "comp" | "credits" | null;
export interface RightEntry { allowed: boolean; verdict?: boolean; reason: string | null }
export interface RightInput {
  /** Feature-list item; null = could not be read. */
  entry: RightEntry | null;
  /** Where the right comes from. null = unknown (the list has no source column until U5): never guessed. */
  source: RightSource;
  door: "open" | "not_held" | "unavailable";
  comingSoon?: boolean;
  viewer: "manager" | "member" | "staff";
  mode: "shadow" | "enforce";
  estimate?: number | null;
  balance?: number | null;
  /** ISO date / datetime of the right's or contract's end. */
  endsAt?: string | null;
  contractStatus?: "active" | "trial" | "past_due" | "canceled" | "expired" | null;
  walletHold?: boolean;
  emailUnverified?: boolean;
  productName?: string;
  featureName?: string;
  /** Only to hide staff-only reseller keys (`X.resell`). */
  featureKey?: string;
}
export interface RightLabel {
  code: string | null;
  label: string | null;
  text: string;
  action: string | null;
  tone: RightTone;
  /** S15 small print (staff in shadow mode). */
  note: string | null;
}

export const SHADOW_NOTE = "影子模式：不擋、不扣點，顯示的是正式啟用後的結果";
const NONE: RightLabel = { code: null, label: null, text: "", action: null, tone: "gray", note: null };
const date = (v?: string | null) => (v ? (/^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : v) : null);
const nt = (n: number) => `${n} 點（NT$${n}）`;
const L = (code: string, label: string | null, text: string, tone: RightTone, action: string | null = null): RightLabel =>
  ({ code, label, text, action, tone, note: null });

function core(i: RightInput): RightLabel {
  const verb = i.featureName ?? "執行";
  if (i.comingSoon) return L("S13", "即將推出", "即將推出", "gray");
  if (i.door === "not_held") {
    const p = i.productName ? `「${i.productName}」` : "此產品";
    return L("S1", "未開通", `${p}尚未開通。這是加購的產品，每個功能要分開購買，或由我們贈送後才能使用。`, "gray", "回到我的工作台");
  }
  if (i.door === "unavailable") return L("S12", "暫時無法確認", "暫時無法確認開通狀態，請重新整理頁面再試一次。", "gray", "重新整理");
  if (i.emailUnverified) return L("S14", null, "請先完成 email 確認再進入", "yellow", "重寄確認信");
  const e = i.entry;
  if (!e) return NONE;
  if (e.reason === "back_office_only" || i.featureKey?.endsWith(".resell")) return NONE;
  if (e.reason === "infrastructure_error") return L("S12", "暫時無法確認", "暫時無法確認開通狀態，請重新整理頁面再試一次。", "gray", "重新整理");
  if (i.walletHold) return L("S11", "處理中", "你的帳戶有一筆付款正在確認，確認完成前暫時不能使用點數。", "yellow", "聯絡我們");
  const hasNums = i.estimate != null && i.balance != null;
  const held = e.verdict ?? e.allowed;   // what enforce answers; `allowed` is always true in shadow
  if (!held) {
    if (e.reason === "no_credits") {
      return L("S7", "點數不足", hasNums ? `這次需要約 ${i.estimate} 點，你有 ${i.balance} 點。` : "點數不足。", "red",
        i.viewer === "member" ? "請通知單位管理者儲值" : "儲值");
    }
    if (e.reason === "no_entitlement") {
      if (i.contractStatus === "expired" && i.balance != null) {
        const d = date(i.endsAt);
        return L("S9", "已到期", `合約已${d ? `於 ${d} ` : ""}結束，點數 ${i.balance} 點仍保留。`, "yellow", "續約");
      }
      if ((i.balance ?? 0) > 0 && i.featureName) {
        return L("S8", "未開通", `你的點數只能用在已開通的功能；「${i.featureName}」還沒開通。`, "gray", `開通${i.featureName}`);
      }
      return L("S2", "未開通", "尚未開通此功能", "gray", "了解");
    }
    return { ...NONE, text: "目前無法使用" };   // invalid_subject / unknown_feature / unknown reasons
  }
  const d = date(i.endsAt);
  if (i.contractStatus === "trial") return L("S10", "試用中", d ? `試用到 ${d}` : "試用中", "blue", "續約");
  if (i.contractStatus === "past_due") return L("S10", "逾期", d ? `逾期，寬限到 ${d}` : "逾期", "yellow", "續約");
  if (i.contractStatus === "canceled") return L("S10", "已取消", "已取消", "red", "續約");
  if (i.source === "contract") return L("S3", "方案內", "方案內，不另外扣點", "green");
  if (i.source === "comp") return L("S4", "贈送", d ? `贈送，可用到 ${d}` : "贈送", "blue");
  if (i.source === "credits") {
    const act = i.estimate != null ? `${verb} · 約 ${i.estimate} 點` : verb;
    if (i.contractStatus === "active") {
      return L("S6", "扣點", `你的合約不含這個功能的用量，${i.estimate != null ? `每次約 ${nt(i.estimate)}` : "每次依用量扣點"}`, "gray", act);
    }
    return L("S5", "扣點", i.estimate != null ? `每次依用量扣點，約 ${nt(i.estimate)}` : "每次依用量扣點", "gray", act);
  }
  return NONE;   // allowed but the source is unknown: no label, nothing guessed
}

export function rightLabel(input: RightInput): RightLabel {
  const r = core(input);
  return input.viewer === "staff" && input.mode === "shadow" && r.code !== null ? { ...r, note: SHADOW_NOTE } : r;
}

/** After an operation or a purchase (S16a–c, S18): fixed sentences with the numbers filled in. */
export type RightOutcome =
  | { kind: "refunded" }
  | { kind: "partial"; done: number; charged: number; failed: number; refunded: number }
  | { kind: "depleted"; short: number }
  | { kind: "updated" };

export function outcomeLabel(o: RightOutcome): RightLabel {
  switch (o.kind) {
    case "refunded": return L("S16a", "已退回", "這次沒有產出，點數已退回。", "gray", "再試一次");
    case "partial": return L("S16b", "部分扣點", `已完成 ${o.done} 張，扣 ${o.charged} 點；${o.failed} 張失敗，已退回 ${o.refunded} 點。`, "yellow", `重試失敗的 ${o.failed} 張`);
    case "depleted": return L("S16c", "點數用完", `結果已產出，但點數不夠付完整費用，已扣到 0（差 ${o.short} 點）。請儲值後再繼續。`, "red", "儲值");
    case "updated": return L("S18", "更新中", "已更新，最多 5 分鐘內全部功能生效。", "blue", "重新整理");
  }
}
