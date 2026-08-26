/**
 * 決定「內容工具開頁時要選哪個站」的唯一規則（2026-08-26）。
 *
 * 為什麼要抽成純函式：原本這段寫在 `ContentStudio` 的 useEffect 裡，一行
 *     setSelectedSiteId(match ? match.id : data.sites[0].id)
 * 意思是「網址明確指定的 ?siteId= 取不到時，靜默改用清單第一個站」。那是一整類問題而不是
 * 一個實例 —— 取不到的原因可以是：站被停用、站被刪除、UUID 打錯、或**那個站屬於別的租戶而
 * 被 `canAccessOrg` 濾掉了**。任何一種情況下，操作者看到的畫面都會是「我要的那個客戶」，
 * 實際指向的卻是另一個客戶，而且沒有任何提示。
 *
 * 不變量：**明確指定的目標取不到時，不得靜默改用另一個目標 —— 要讓人看見。**
 * 沒有指定時才可以挑預設值（那不是替換，是初始化）。
 *
 * 抽成純函式也讓這條規則可以被測試（React effect 在 node 環境的 vitest 裡測不到）。
 */
export interface PickInitialSiteResult {
  /** 要選的站 id；空字串 = 沒有可選的，或指定的取不到（此時 UI 必須要求人重選）。 */
  selectedId: string;
  /** 非 null = 網址指定了這個 id 但清單裡沒有，UI 必須顯示出來，不可吞掉。 */
  unresolvedRequest: string | null;
}

export function pickInitialSite<T extends { id: string }>(
  sites: readonly T[],
  requestedId: string | null | undefined,
): PickInitialSiteResult {
  const requested = (requestedId ?? "").trim();

  if (!requested) {
    // 沒指定 → 挑第一個當預設。這是初始化，不是替換，所以不需要警告。
    return { selectedId: sites[0]?.id ?? "", unresolvedRequest: null };
  }

  const match = sites.find((s) => s.id === requested);
  if (match) return { selectedId: match.id, unresolvedRequest: null };

  // 指定了卻取不到 → 一律不選。**刻意不回退到 sites[0]**：那正是這個函式要關掉的行為。
  return { selectedId: "", unresolvedRequest: requested };
}
