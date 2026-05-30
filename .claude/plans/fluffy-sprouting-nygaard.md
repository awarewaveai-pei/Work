# 修正：統一 ops-console 與 ops/clients 的客戶來源

## Context（為什麼要改）
`/ops-console` 和 `/ops/clients` 兩個畫面都列「客戶/tenant」，理應來自同一份資料（Supabase `organizations` 表）。經查程式碼 + 線上實測：

- **Happy path 其實已對齊**：`/api/ops/summary` 在 Supabase 可用時已從 `organizations` 讀取（[summary/route.ts:70-95](lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/summary/route.ts#L70-L95)），線上回傳真實名稱「Soulful Expression Art Therapy / AwareWave Ops」。
- **真正的缺陷在 fallback**：當 Supabase client 為 null 或查詢出錯時，會回傳**寫死的 2 筆假客戶**（[summary/route.ts:5-22](lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/ops/summary/route.ts#L5-L22)，slug `awarewave`/`soulful-expression`，連 slug 都跟真實 DB（`soulful` 等）不一致）。一旦觸發，ops-console 會默默顯示一組**與 `/ops/clients` 不同、且根本不存在**的客戶，且任何 slug-based 連結都會壞掉。

**目標**：讓 `tenants` 永遠只來自 `organizations`；DB 不可用時誠實顯示空狀態（ops-console 已內建 EmptyRow），而非捏造客戶。`mediaRules` / `actions` 是合法靜態設定，**不動**。

## 改動範圍（單一檔案）
**`app/api/ops/summary/route.ts`**

1. **刪除**寫死的 `tenants` 常數陣列（行 5-22）。`mediaRules`（行 24-40）與 `actions`（行 42-67）原樣保留。
2. **重構 `GET()`**，三條路徑都回傳相同 JSON 形狀（`generatedAt / sourceOfTruth / tenants / mediaRules / actions`），只差 `tenants` 與 `sourceOfTruth`：
   - `!supabase` → `tenants: []`，`sourceOfTruth: "supabase-unavailable"`
   - 查詢有 `error` → `tenants: []`，`sourceOfTruth: "supabase-error"`
   - 成功 → 沿用現有 mapping（行 79-86），`sourceOfTruth: "supabase"`
3. 保留 HTTP 200 + 既有 key 形狀（此端點被 Uptime Kuma 當監控點 ping，不可改回應碼/結構）。

### 不做的事（明確排除，避免 scope 蔓延）
- 不改 `OpsTenant` 型別（[ops-contracts.ts:3-10](lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/ops-contracts.ts#L3-L10)）。
- 不讓 ops-console 顯示與 clients 完全相同的欄位（health probe / metadata）。兩頁是「同一來源、不同詳細度」即可滿足「客戶來源一樣」。
- 已知次要限制（本次不修，僅記錄）：summary 仍會合成 `lastRunStatus: "completed"` 與用 `org.status` 推導 `riskLevel`——這是顯示層的近似值，非客戶清單來源問題。

## 驗證計畫（R0 四動作）
1. **實測**：在 `apps/next-admin/` 跑 `npx tsc --noEmit`（.ts 改動強制，build gate）；本機 `npm run dev` 後 `curl http://127.0.0.1:3000/api/ops/summary` 確認 happy path 回真實 org 名稱 + 形狀不變；載入 `/ops-console` 確認 Tenants Snapshot 顯示真實客戶。（DB-down 路徑無法本機真實觸發 → 標 `REALTEST_WAIVED: NA -- cannot induce supabase outage locally`，改以 tsc + happy-path curl 覆蓋。）
2. **Review**：跑 `/review`（critic subagent）對 route.ts 改動；結論納入 [驗證結果]。
3. **抓蟲**：`grep` 範圍含 `agency-os` + `scripts` + `lobster-factory`，pattern：`/api/ops/summary`、`supabase-fallback`、`sourceOfTruth`、`tenant-awarewave`、`tenant-soulful-expression`，確認無其他程式依賴寫死 fallback 或舊 slug。
4. **WORKLOG**：寫入根因（fabricated fallback tenants 致兩頁分歧）+ 四動作結果 + REALTEST/REVIEW/BUGHUNT 證據行。

## 部署
此檔屬 next-admin，改動後走 `sg-deploy.sh next-admin`（內建 npm test + typecheck gate + Step 7 smoke + 自動 rollback）。風險等級 Low–Medium（單一唯讀 API route、無 auth/DB migration/金流）。
