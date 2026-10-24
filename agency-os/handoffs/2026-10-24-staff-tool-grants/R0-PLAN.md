# 員工逐工具權限（staff tool grants）— R0 七段

> 狀態：**待操作者批准**（High：身分／授權邊界）。批准前不改程式。
> 路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 1. 任務理解

每個員工可勾選能用哪些工具。沒勾的：側欄不顯示、直接打網址擋、API 擋。owner 永遠全部打勾、不能被取消（操作者定案）。

**不變量（整類關掉，不是只關眼前）**：
> 一個員工能到達某個員工頁或 API ⇔ 該路徑屬於的工具 key 在他的授權集合裡；owner 的授權集合＝全部且不可改。

單一判斷 `staffMayUse(identity, toolKey)`，三個出口（側欄／頁／API）同一來源，路徑→工具 key 來自登記表，新工具＝新登記列＝自動出現在勾選矩陣，不另維護清單。

## 2. 現況分析

| 事實 | 證據 |
|---|---|
| 角色只有四種 owner/admin/operator/viewer，存 Supabase `app_metadata.ops_role`，middleware 解析後注 `x-ops-claims-role` | `middleware.ts:102-109`, `lib/ops-contracts.ts:1` |
| 身分三 header 在 fast／slow 兩條路徑都注入；客戶擋門也在兩處（`isClientOutsideDoor`） | `middleware.ts:353-359`, `:385-392` |
| 身分有 cache：FRESH 15s、STALE 120s、`CachedIdentity {role,userKind,orgId,userId}` | `lib/supabase/session-cache.ts:39-48` |
| 工具清單三來源：產品 `staffPaths`＋`door.api`、`STAFF_UTILITIES`（2）、`BACK_OFFICE`（19） | `lib/portal/products.ts:35,98-111` |
| 登記表機械閘：`app/(shell)/{tools,ops}/*` 每個目錄必在登記表 | `lib/portal/__tests__/products.test.ts:141` |
| 門 API 前綴必是真實 route dir、由一個產品擁有 | `lib/portal/__tests__/registry-code.test.ts:157` |
| 付費路由→feature 表（程式內） | `lib/entitlements/route-features.ts:4-44` |
| 側欄＝靜態 `DEFAULT_SECTIONS`（client），layout 只傳 theme 排序；每頁必在側欄或 allowlist | `app/SidebarNav.tsx:26`, `app/(shell)/layout.tsx:22`, `app/__tests__/sidebar-coverage.test.ts:36` |
| 逐人授權前例：`social_brand_members`（0103）用 `x-ops-user-id`，UI 是按鈕 chips 不是下拉 | `lib/social/authz.ts:30-34`, `app/(shell)/tools/social/Members.tsx` |
| 最後一個 owner 鎖前例 | `packages/db/migrations/0103_social_brand_members.sql` `social_lock_members_for_change` |
| 影子→強制 旗標前例 `ENTITLEMENT_MODE` | `lib/entitlements/can.ts:64-68` |
| 員工帳號今天沒有管理頁；`ops_role` 手動在 Supabase 設 | `APP_AWARE_WAVE_CURRENT_STATE.md:28`；grep `auth.admin` 只有 client-invite／signup |
| `/api/ops` 下有 7 個 dir 不對應任何 BACK_OFFICE key（ai-image-jobs, analytics-context, audit-events, build-id, organizations, tenants, workflow-runs） | `ls app/api/ops` |
| 最新 migration 0122 | `packages/db/migrations/` |

git log（products.ts／ops-role.ts／middleware.ts 近 12 筆）：b3132c733 … e8f13684d，全是 ADR 018 門系列；middleware 最後動在 805e6ecdc（客戶走門）。無人在做員工權限。

**同時有另 3 個 session 在 repo 寫檔**（hook 警告：`lib/content/topics/tick.ts`、ADR 017 由別的 session 在編輯）；本任務不碰那兩檔。

## 3. 風險清單

| # | 風險 | 處置 |
|---|---|---|
| R1 | 強制開啟那刻所有員工沒設授權 → 全站鎖 | `STAFF_TOOLS_MODE=shadow`（預設）只記 `would_deny`；owner 把每人設好、7 天 0 筆才翻 enforce（High，另要 go） |
| R2 | owner 把自己鎖出 | owner 不看授權集合，程式層短路；API 拒改 owner 的工具；最後一個 owner 不能降級（0103 前例） |
| R3 | 路徑沒對到任何工具 → 漏擋 | 測試：`app/(shell)/**` 每個頁目錄、`app/api/**` 每個 route 目錄必屬一個工具或 `PLATFORM`（永遠可用）清單；運行時遇未知路徑 enforce＝拒 |
| R4 | middleware 是 Edge，不能查 DB | 授權存 `app_metadata.staff_tools`（同 `ops_role` 一層），`getUser()` 已帶回，零新查詢 |
| R5 | 撤權延遲 | 同既有 role cache 取捨：≤15s＋stale 上限 8 次；不加寬 |
| R6 | 一個產品多頁共用 API（canvas／banner 共用 `/api/tools/presets`） | 授權粒度＝登記列（產品），不是頁；見決策 1 |
| R7 | 員工在產品門（`social.aware-wave.com`）繞過 | 門的工具 key＝產品 key，同一判斷 |
| R8 | 首頁 dashboard 鏡射側欄分區 | 同一 resolver 過濾（`app/(shell)/page.tsx`） |

## 4. 方案比較

**A 最小**：side bar 依 `staffPaths` 隱藏＋middleware 擋頁；API 不擋；授權用 SQL 手設。
rollback：移除 middleware 兩行＋側欄 filter。
→ **否決**：隱藏≠授權，API 照打；操作者明說「API 也擋」。補丁。

**B 完整（建議）**：
1. `lib/portal/staff-tools.ts`：由登記表推導 `STAFF_TOOLS[]`＝`{key, name, pages[], apis[]}`；`BACK_OFFICE`／`STAFF_UTILITIES` 值由字串改成 `{name, why, apis?}`；`STAFF_PLATFORM`（`/`、門的平台 API、`/api/ops/build-id`、`/api/ops/analytics-context`：任何員工都可）。測試：每頁目錄、每 API route 目錄恰屬一工具或 PLATFORM。
2. `lib/staff-access.ts`：`toolOf(pathname)`、`staffMayUse(identity, key)`（owner ⇒ true）、`staffToolsMode()` shadow|enforce。
3. middleware：解析 `app_metadata.staff_tools`→`CachedIdentity.tools`→注 `x-ops-tools`（加進 strip 清單）；fast／slow 兩路徑都查，shadow 只 `console.warn [staff-tools] would_deny`，enforce 頁→`/no-access?tool=`、API→403 `{error:"tool_not_granted",tool}`。
4. 側欄＋dashboard：layout 讀 headers → 允許集合 → 過濾 `DEFAULT_SECTIONS`（空分區不畫）。測試：每個側欄連結恰對一工具。
5. `/ops/staff` 頁＋`/api/ops/staff`：列員工（`auth.admin.listUsers` 濾 `user_kind≠client`）、改角色、勾工具；只 owner 可寫；owner 列全勾且 disabled；最後 owner 鎖；每次寫 audit（既有 `ops audit-events`）。登記 `BACK_OFFICE["ops/staff"]`。
6. 文件：ADR 019（員工工具授權；三軸 C 的 staff actor 補強）＋`APP_AWARE_WAVE_CURRENT_STATE.md` 身分段。
rollback：`STAFF_TOOLS_MODE` 清掉＝shadow（立即）；程式 revert；`app_metadata.staff_tools` 殘留無害（沒人讀）。無 DB migration。

## 5. 建議方案

B。零新表、零 migration；一個判斷三個出口；登記表＝勾選矩陣的來源；先 shadow。

**操作者決定（2026-10-24「寫入監工台再開工」＝照建議值批准 B）**
- D1 粒度＝一個產品一格；後台頁一頁一格；兩個員工小工具各一格。
- D2 只有 owner 能改別人的工具與角色。
- D3 shadow 期間：還沒設定的員工全部可用，只記 `would_deny`。

## 6. 實作計畫

每節一張卡、一個 commit。狀態只在監工台 `data.mjs`，本節不寫狀態。

### C1 員工工具登記表

| 卡號 | 做什麼 |
|---|---|
| C1.1 | `lib/portal/staff-tools.ts`：由 `PRODUCTS`（`staffPaths`＋`doorApis()` 去掉 `PLATFORM_APIS`）、`STAFF_UTILITIES`、`BACK_OFFICE` 推出 `STAFF_TOOLS[]`＝`{key,name,pages[],apis[]}`；`BACK_OFFICE`／`STAFF_UTILITIES` 加中文短名欄 |
| C1.2 | 員工專用 API（不在任何門上）逐一歸格：`STAFF_API_OWNERS` 前綴→工具 key[]（共用 API 列多格，任一格即可用；多條命中取**最具體**的一條；產品的 API 不給後台格共同擁有，別的頁要用就列「需另勾」）；`STAFF_PLATFORM`＝所有員工都能用（`/`、門的平台 API、`/api/ops/build-id`、`/api/ops/analytics-context`） |
| C1.3 | `toolsFor(pathname)`：最長前綴，回傳 `"platform"`／工具 key[]／`null`（沒歸格） |
| C1.4 | 測試：`app/(shell)/**` 每個頁目錄、`app/api/**` 每個 route（webhooks／internal／auth 與 `PUBLIC_API_PATHS` 除外）`toolsFor` 不為 null；每個工具至少一頁；key 不重複 |

### C2 身分帶工具、擋網址與 API

| 卡號 | 做什麼 |
|---|---|
| C2.1 | `CachedIdentity` 加 `tools: string[] \| null`（null＝尚未設定）；middleware 讀 `app_metadata.staff_tools`；`x-ops-tools` 加進 strip 清單後注入 |
| C2.2 | `lib/staff-access.ts`：`staffMayUse(identity, keys)`（owner＝true；platform＝true；null＝shadow 時 true）；`staffToolsMode()` 只認 `enforce` |
| C2.3 | middleware fast／slow 兩路徑都判斷（只對 staff）；shadow → `console.warn [staff-tools] would_deny`；enforce → 頁 302 `/no-access?tool=`、API 403 `{error:"tool_not_granted"}`；產品門同一判斷 |
| C2.4 | 測試：owner 短路、未歸格路徑 enforce 拒、shadow 放行且記錄、fast path 也擋、偽造 `x-ops-tools` 被剝 |

### C3 側欄與首頁只顯示有權限的

| 卡號 | 做什麼 |
|---|---|
| C3.1 | `app/(shell)/layout.tsx` 讀 headers 算可用工具，傳給 `SidebarNav`；過濾連結，空分區不畫 |
| C3.2 | 首頁 `app/(shell)/page.tsx` 分區同一過濾 |
| C3.3 | 測試：每個側欄連結 `toolsFor` 不為 null |
| C3.4 | 客戶中心內嵌的其他產品分頁（AI 客服、資料蒐集、開發信、內容行銷的網站與社群）：員工沒勾該產品就不顯示；清單＝`staff-tools.test.ts` `NEEDS_OTHER_TOOL["ops/clients"]` |

### C4 員工權限頁 /ops/staff

| 卡號 | 做什麼 |
|---|---|
| C4.1 | `GET/PATCH /api/ops/staff`：列員工（`auth.admin.listUsers` 濾掉 `user_kind=client`）；只 owner 可改角色與 `staff_tools`；owner 的工具不能改；最後一個 owner 不能降級；每次寫 `ops audit-events` |
| C4.2 | 頁面：每人一列，角色四顆按鈕，工具依「產品／工具／後台」分三排勾選框，全選／全不選，儲存；owner 列全勾且鎖住 |
| C4.3 | 新增員工：輸入 email 寄邀請（`user_kind=staff`，預設 viewer、沒有工具） |
| C4.4 | `BACK_OFFICE["ops/staff"]` 登記＋側欄連結 |

### C5 沒權限頁與文件

| 卡號 | 做什麼 |
|---|---|
| C5.1 | `/no-access` 頁：說是哪個工具、請找擁有者開 |
| C5.2 | ADR 019 員工工具授權＋`ADR_INDEX.md` |
| C5.3 | `APP_AWARE_WAVE_CURRENT_STATE.md` 身分段加 `staff_tools`；`RUNNABLE_DEMOS.md` 一條指令 |

### C6 上線

| 卡號 | 做什麼 |
|---|---|
| C6.1 | 推上 main，台灣 03:00 自動部署（shadow，行為不變） |
| C6.2 | owner 在 /ops/staff 設好每個員工（操作者） |
| C6.3 | 看 7 天 `would_deny` 紀錄，逐筆解釋或補設定 |
| C6.4 | 翻 `STAFF_TOOLS_MODE=enforce`（High，操作者另批；走 `safe-infra-patch.sh compose`） |

## 7. 驗證計畫（四動作）

- 實測：`npx tsc --noEmit`；`npx vitest run lib/portal lib/staff-access app/__tests__`；本機 `OPS_ALLOW_SIMULATED_ROLE_FALLBACK=true` 起 dev，curl `x-ops-simulated-role: operator` 配 `staff_tools=[]`：頁 302 `/no-access`、API 403；owner 200。部署後 `docker logs lobster-next-admin | grep '\[staff-tools\]'`。
- Review：`/codex-review`（auth 邊界 → Deep，≥2 critic 逐 claim）。
- 抓蟲：Grep `staffPaths|STAFF_UTILITIES|BACK_OFFICE|x-ops-claims-role|CachedIdentity`，scope `agency-os`,`scripts`,`lobster-factory`。
- 突變：拔掉 owner 短路 → owner 測試紅 → 還原綠；拔掉 fast path 檢查 → 測試紅。
- WORKLOG 四行機械證據。

## 畫面草圖 `/ops/staff`（單欄、按鈕不下拉、白話）

```
員工權限                                              [＋ 新增員工]
──────────────────────────────────────────────────────────────────
pei@…            擁有者        全部工具 ✓（擁有者不能取消）

amy@…            角色  [擁有者] [管理員] [●操作] [唯讀]
  產品   ☑ 社群發文  ☑ 內容行銷  ☐ 影片製作  ☐ 塔羅製圖  ☑ 設計編輯器
         ☐ 商品設計工作室  ☐ AI 客服  ☐ 資料蒐集器  ☐ 行銷開發信
  工具   ☑ 後台外觀  ☑ 模型資料
  後台   ☐ 客戶  ☐ 排程  ☐ 維修  ☐ 串接  ☐ 系統模式  ☐ 簽核  ☐ 備份
         ☐ 告警  ☐ 成本  ☐ 帳務  ☐ 客戶啟用  ☐ 工具清單  ☐ 產品表
         ☐ 建站  ☐ 營運總台  ☐ 佈建  ☐ API 檢查  ☐ 員工權限
  [全選] [全不選]                         [儲存]   上次：10-24 pei
──────────────────────────────────────────────────────────────────
```

員工端：側欄只剩打勾的；手打網址 → 「你沒有這個工具的權限，請找擁有者開」頁；API → 403 `tool_not_granted`。
