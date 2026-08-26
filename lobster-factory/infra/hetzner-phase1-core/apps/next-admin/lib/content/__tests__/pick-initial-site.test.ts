/**
 * `pickInitialSite` 的規則測試。核心不變量：明確指定的目標取不到時，**不得**靜默改用別的目標。
 */
import { describe, it, expect } from "vitest";
import { pickInitialSite } from "../pick-initial-site";

const SITES = [
  { id: "11111111-1111-4111-8111-111111111111", name: "A 客戶" },
  { id: "22222222-2222-4222-8222-222222222222", name: "B 客戶" },
];

describe("pickInitialSite", () => {
  it("沒指定 → 取第一個當預設（初始化，不是替換）", () => {
    expect(pickInitialSite(SITES, "")).toEqual({ selectedId: SITES[0].id, unresolvedRequest: null });
    expect(pickInitialSite(SITES, null)).toEqual({ selectedId: SITES[0].id, unresolvedRequest: null });
    expect(pickInitialSite(SITES, undefined)).toEqual({ selectedId: SITES[0].id, unresolvedRequest: null });
  });

  it("指定且找得到 → 選它", () => {
    expect(pickInitialSite(SITES, SITES[1].id)).toEqual({ selectedId: SITES[1].id, unresolvedRequest: null });
  });

  it("指定但找不到 → 不選任何站，並回報 unresolvedRequest（不得靜默改用第一個）", () => {
    // 涵蓋整類原因：停用、已刪除、UUID 打錯、屬於別的租戶被 canAccessOrg 濾掉 —— 對這個函式
    // 而言它們是同一件事「清單裡沒有」，所以一條規則就關掉全部。
    for (const missing of [
      "99999999-9999-4999-8999-999999999999", // 停用／已刪除／別的租戶
      "not-a-uuid",                            // 打錯
    ]) {
      const r = pickInitialSite(SITES, missing);
      expect(r.selectedId, `${missing} 不得回退到 sites[0]`).toBe("");
      expect(r.unresolvedRequest).toBe(missing);
    }
  });

  it("前後空白不影響比對", () => {
    expect(pickInitialSite(SITES, `  ${SITES[1].id}  `)).toEqual({ selectedId: SITES[1].id, unresolvedRequest: null });
  });

  it("清單為空：沒指定 → 空選擇無警告；有指定 → 回報取不到", () => {
    expect(pickInitialSite([], "")).toEqual({ selectedId: "", unresolvedRequest: null });
    expect(pickInitialSite([], "abc")).toEqual({ selectedId: "", unresolvedRequest: "abc" });
  });
});
