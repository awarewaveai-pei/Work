# 第 8 項：每個產品長成單一產品的樣子（產品門頁、獨立版面、示範狀態）

**風險** Medium（每個產品的門上線是 High，要 go）　**模型** Fable 5.1 定版面規則 → Opus 5.5 逐產品做　**前置** 第 1 項（登記列）、第 3 項（收費按鈕要先有 `can()`）　**正本** ADR 017 順序 8；ADR 018 §2（產品門用自己的精簡版面，元件與員工門共用）

## Decision
- 操作者 2026-10-18：「他們還沒有展現單一產品的樣貌」。登記列只給名字，本項給樣子。每個登記產品（cs、collect、outreach、video、tarot、studio、design、content；social 已有）各做一次，同一套規則：
  1. 把現在住在 `/ops/<x>` 或 `/tools/<x>` 的頁面抽成共用元件 `lib/<key>/ui/<Key>App.tsx`（照 `app/social/page.tsx` 與 `app/(shell)/tools/social/` 共用 `SocialApp` 的做法）；員工門路徑照舊渲染同一元件。
  2. 加產品門路由 `app/<key>/{layout,page}.tsx`：精簡版面（不套員工側欄）、產品名、一句用途、自己的導覽（只有這個產品的頁），`globals.css` 的 `.door-main`／`.door-foot`。
  3. 畫面開場是**可用的狀態**，不是空殼：登記表 `features[]` 渲染成功能清單（已買可按、未買灰掉，資料來自第 3 項的簽章功能清單）；有示範資料或範例。每個工具＝完整的一頁（操作者 2026-10-14「每個工具都要是冰山等級的完整頁」）。
  4. `MODULE_MANIFEST.json` 十項無 `TODO`。
  5. `status: "available"` 的條件（測試擋）：門頁存在、manifest 無 TODO、`features` 非空、`/playwright smoke` 對 `https://<subdomain>.<base>/` 綠。
- 上線一個門＝DNS、憑證 SAN、主機 nginx、lobster-nginx 區塊（照 social 2026-10-15 的 WORKLOG 續30 做法），High，逐產品要 go。
- 員工門產品目錄 `/ops/products`（原卡 `task_86d6f772` 併入本項，2026-10-23）：只讀 `products.ts` 列出每個產品的門、status、features；三軸與五種的正本只留 ADR 017 §0，不建 `customer-model.ts`（兩份會互相矛盾）。
- 開門規則（2026-10-23 操作者同意，正本 ADR 018 §2「開門規則」1–3）：API 範圍＝自身＋`dependsOn`＋`PLATFORM_APIS`；資料以組織為界、登入門頁不用 service role、門可呼叫的路由皆授權；多頁產品用 `door.nav`。上方 1.「抽成 `lib/<key>/ui`」改為沿用員工頁原元件（social 先例），伺服器端讀全客戶資料的頁才拆。
- 客戶身分在 `resolveOpsRole` 固定為 operator（2026-10-23，操作者選方案 B）：開每個門前逐條核對它的路由——付費工作要向請求者的組織計費（tarot 批次曾記到 internal，已修）、客戶可寫可刪的資料限本人或本組織；outreach 的 `canManageOutreach` 本身不分租戶（`lib/ops-role.ts` Cold Outreach 段），開門前必須補組織過濾。
- 開門順序（2026-10-23 重排，依「客戶可直接操作的現成工具」優先）：tarot、studio（2026-10-23 已上線，WORKLOG 續49／續50）→ video → design → content；cs、collect、outreach 的員工頁是跨客戶營運後台，排最後。cs 暫緩到 Chatwoot 載體上線（`app/(shell)/ops/cs/page.tsx:43,63`；`cs-widget` 為 MockTransport）：客戶介面在 `ops/clients/[slug]/CustomerServiceTab.tsx`＋`CsIntentsCard.tsx`，API 在 `/api/ops/clients/[slug]/cs-*`，開門時搬到 cs 前綴並改共用元件。
- 門上線前阻擋項（critic 2026-10-23；狀態 WORKLOG 2026-10-23 NEXT ② 條目）：① 用量已記（付費縫 `grant.recordUse()`＋閘「每個 credits 功能走到 recordUse」）；扣點已定：依實際成本（4b-11，`lib/ai/log-ai-call.ts` → `Grant.report`／`Grant.hold`）。② tarot 批次記操作者：已做——0119 已套 prod（2026-10-23，操作者同意），卡片 callback 以批次發起人問 tarot.image（`tarot_batch_jobs.actor`）。③ studio 已做：culture 精選免費路徑在付費閘之前，`StudioWorkbench` 在 `ops.cheap-json` 不可用時藏模型選擇、時事靈感、AI 換一批。
- 已建的門另受閘 ④：路由的 import 走到 `lib/entitlements/grant.ts` 就必須自己宣告計費功能（否則函式庫 `grantFor` 記到 internal）。
- 階段 0 已做 `e8f13684d`：門禁 ①（API 可達）②（不用 service role）、`ProductDoorShell`、`/ops/products`。
- 不做：不重寫業務邏輯、不搬資料表、不改 API 前綴。

## Files
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/<key>/{layout,page}.tsx`（每產品）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/<key>/ui/<Key>App.tsx`（每產品，抽自現有頁）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/__tests__/products.test.ts`（`available` 條件）
- `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`、主機 `sg-stack.aware-wave.com.conf`（每個門一塊）

## Acceptance（每個產品各跑一次）
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run lib/portal lib/<key>
```
→ 綠；測試名含 `an available product has a door page, a complete manifest and at least one feature`。
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx tsc --noEmit -p .
```
→ exit 0。
本機 `npm run dev` 後，瀏覽器以 Host `<subdomain>.localhost` 開 `/` → 看到產品門版面（無員工側欄、有產品名與功能清單）；`/ops/<x>` 舊路徑仍可用、畫面相同。截圖進 WORKLOG。
上線後：`/playwright smoke` 加該門；`curl -sI https://<subdomain>.aware-wave.com/` → 200。
突變：把 `app/<key>/page.tsx` 改名 → `products.test.ts` 紅（available 條件）；還原綠。

## 完成後
開了哪些門以登記表 `door.enabled` 為準（`/ops/products` 直接顯示），不在監工台另存清單；全部開完才把 `STEPS[7].status` 改 `done`。

## Rollback
`git revert`；門未上線前無外部影響；已上線的門用 nginx 區塊移除＋DNS 刪除（各一條指令，寫在上線 WORKLOG）。
