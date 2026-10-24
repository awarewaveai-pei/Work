# ADR 019: 員工逐工具權限 — 擁有者替每位員工勾選工具；側欄、網址、API 同一個判斷；先只記錄再擋

- **狀態**：已接受（操作者 2026-10-24「寫入監工台再開工」＝照建議值批准方案 B；正式擋（`STAFF_TOOLS_MODE=enforce`）另需操作者同意）。
- **日期**：2026-10-24
- **承接**：[ADR 017](017-entitlements-and-self-hosted-modules.md) §0（操作軸 `actor`：員工也是主體）、[ADR 018](018-product-doors-and-buyout-delivery.md) §1（員工門／產品門）。
- **計畫與卡**：`agency-os/handoffs/2026-10-24-staff-tool-grants/R0-PLAN.md`；監工台 https://claude.ai/artifact/RbxhBAEU7KsaxuJ9zKeJL6。

## 脈絡

員工權限原本只有四種角色（`app_metadata.ops_role`，`middleware.ts resolveRoleFromUser`）。操作者要每位員工可勾選能用的工具：沒勾的不出現在側欄，直接打網址與呼叫 API 也擋；擁有者永遠全部、不可取消。

## 決策

1. **粒度**：一個產品一格；一個後台頁一格；兩個員工小工具各一格。格子由登記表推出（`lib/portal/staff-tools.ts STAFF_TOOLS`，來源 `products.ts PRODUCTS／STAFF_UTILITIES／BACK_OFFICE`）；新頁或新 API 沒歸格＝測試紅（`staff-tools.test.ts`）。
2. **授權存哪**：Supabase `app_metadata.staff_tools`（與 `ops_role` 同層，伺服器控制），不建表、不加 migration。沒有這個欄位＝「從沒設定」。
3. **一個判斷三個出口**：`lib/staff-access.ts staffDenial`（擁有者永遠過；所有員工都能用的頁面永遠過；沒有工具擁有的路徑拒）。middleware 在快取路徑與驗證路徑都判斷頁與 API；側欄、首頁、客戶中心分頁用同一套 `toolsFor`。
4. **誰能改**：只有擁有者（`/ops/staff`、`/api/ops/staff`）；擁有者的工具不能改；最後一位擁有者不能降級；每次寫 `ops_audit_events`（記在 `organizations.kind='internal'` 下）。新員工＝唯讀、沒有工具。
5. **上線順序**：`STAFF_TOOLS_MODE` 只認 `enforce`，預設 shadow——只記 `[staff-tools] would_deny`、行為不變；shadow 期間沒設定過的人看到全部。擁有者把每人設好、7 天紀錄逐筆說明後，才由操作者同意翻 enforce（High，走 `safe-infra-patch.sh compose`）。enforce：頁 307 `/no-access?tool=`、API 403 `tool_not_granted`、沒設定過的人只剩所有員工都能用的頁。

## 後果

- 改授權最多 15 秒生效（與角色同一個快取，`lib/supabase/session-cache.ts FRESH_MS`）。
- 側欄資料搬到 `app/sidebar-sections.ts`（server 讀得到）；新增側欄連結改那個檔。
- 撤回：清掉 `STAFF_TOOLS_MODE`＝立即回 shadow；`app_metadata.staff_tools` 殘留無害。
