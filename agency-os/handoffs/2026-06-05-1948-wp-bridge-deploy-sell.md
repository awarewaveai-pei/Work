---
slug: wp-bridge-deploy-sell
created_utc: 2026-06-05T11:48:52Z
hint: "架設網站 https://app.aware-wave.com/ 外掛 並在 https://aware-wave.com/ 展示這個外掛 並賣他"
source_session_summary: "建好 aware-wave-wp-bridge 外掛（認證脊椎+自我修復+admin UI），v0.2.0 推上 private GitHub repo（CI 綠 + release pipeline），9/9 真站驗證 + 裝上 soulful。"
---

## 1. 任務目標
把 wp-bridge 外掛接進 **app.aware-wave.com** Ops Dashboard（駕駛艙操作），在 **aware-wave.com** 做展示/銷售頁，並設定**販售**。

## 2. 為什麼做
產品商業化：核心已證明可用（v0.2.0，9/9 真站），要從「能跑」走到「能賣」。

## 3. 已試過
外掛已建：認證脊椎 + 自我修復 transaction + KadenceValidator + runnable REST + admin UI（sidebar 選單/一鍵生金鑰/自我測試）。private repo `awarewaveai-pei/aware-wave-wp-bridge`（CI 綠 + release pipeline 自動 build 可安裝 zip，最新 v0.2.0）。已裝 soulfulexpression.org（`sodium:false` 但 WP `sodium_compat` polyfill 補上，crypto 真站驗過）。**`wp-bridge-client` SDK 尚未建。**

## 4. 卡在哪
三個新工作流尚未開始：(a) next-admin WP Control 面板 (b) aware-wave.com 展示頁 (c) 販售/授權模型。

## 5. 下一步指令

**A. app.aware-wave.com 整合（Dashboard=駕駛艙 / bridge=執行器）**
1. 讀整合計畫：`$WORK_ROOT/lobster-factory/packages/wp-bridge-plugin/WP_BRIDGE_CONTROL_PLANE_DESIGN.md` **§N**（~80% 接點已存在）+ **§H**（client 設計）。
2. 建 `$WORK_ROOT/lobster-factory/packages/wp-bridge-client/`：typed TS client，signed-fetch wrapper 自動算 Ed25519 簽章 + timestamp/nonce/idempotency，私鑰從 vault 讀（`WP_<TENANT>_BRIDGE_PRIVATE_KEY`）。風格對齊既有 `wpFactory.ts`。
3. 在 `$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/[slug]/` 加「WP Control」面板 + `api/ops/clients/[slug]/wp-bridge/*` route（**server 端**用 client 呼叫該租戶 bridge，私鑰不外露瀏覽器）。沿用既有 `wp-report`/`wp-update` 旁。
4. 走 `/check-drift` → `/verify`（含 `npx tsc --noEmit`）→ 提議 `/sg-deploy`（等 go-ahead）。

**B. aware-wave.com 展示頁**
5. `frontend-designer` agent 做 landing。賣點：「他做遙控器，我做有回饋迴路的控制系統」；安全（站被駭也偽造不了寫入）；自我修復 demo（壞寫入自動回滾）。可嵌 live self-test 或錄製 demo。

**C. 販售 / 授權**
6. 決販售模型：`/decide`（decision-intelligence）或 `strategy-review`。DESIGN **§J/§K**：clean-room 已自寫；授權待定（open-core / proprietary-SaaS / license-key）；定價層。

## 6. 相關資源
- 外掛 repo（private）：`github.com/awarewaveai-pei/aware-wave-wp-bridge` + Releases（可安裝 zip，最新 v0.2.0）
- 設計 SSOT：`$WORK_ROOT/lobster-factory/packages/wp-bridge-plugin/WP_BRIDGE_CONTROL_PLANE_DESIGN.md`（§N 整合 / §H client / §J 授權 / §K 範圍工時）
- next-admin：`$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/ops/clients/[slug]/`（已有 wp-report/wp-update route）
- Landmines：① soulful = LIVE 站，真寫入前先建 staging（Hostinger Premium 開獨立網站格，非一鍵 staging）② app.aware-wave 持續被另一 session 改中，WP Control 面板排**最後**接 ③ sodium native 在 Hostinger 要 hPanel 開（選配，polyfill 已能跑）④ 本機測試 WP `d:\tmp\awbridge-compose.yml`（localhost:8888 admin/admin）非 repo，可能已關。
