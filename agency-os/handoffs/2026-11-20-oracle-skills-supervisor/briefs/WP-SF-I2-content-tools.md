# SF-I2 內容工具認得用新流程建的網站

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §1-4。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。整檔讀：`NA/lib/payments/woo.ts`（特別是「sites registered by the site flow」一段：`listBridgeClientsWithRegistered`、`env:<environments.id>` 形式的 client id、`probeRegisteredBridge`）、以及下列每個呼叫端。模型 Opus 5.5（完成後 `critic` 一輪）。

## 目的
SF-I 讓新流程建的網站把 wp-bridge 金鑰存進保管庫，但內容工具的網站清單還只讀環境變數，所以選不到新網站。不變量：凡是「列出可操作的 WordPress 網站」或「替某個網站取 bridge 客戶端」的地方，都同時涵蓋環境變數的站與已登記的站；已登記的站載入失敗時是「未設定」，絕不退回預設網站（寫錯站比失敗嚴重）。

## 已知事實（2026-11-23 grep，動手前自己再 grep 一次，以實況為準）
只讀環境變數的呼叫端：`NA/app/api/tools/publish/route.ts`、`NA/lib/content/publish/wordpress-core.ts`、`NA/lib/content/video/embed-in-post.ts`、`NA/lib/crm/fluentcrm.ts`、`NA/lib/crm/member-newsletter.ts`、`NA/lib/outreach/warm-leads.ts`。`NA/lib/content/r2-delete-guard.ts` 已由 SF-I 改好。

## 要做
1. 每個呼叫端逐一判斷並處理：需要涵蓋新網站的改用含登記站的版本；刻意只給特定站的（例如只服務 aware-wave.com 的商店邏輯）保持不變並在該處加一行註解說明為何不涵蓋。回報列出每一處的判定與理由。
2. 新網站的 `wp_sites` 列沒有 REST token：走 REST 的路徑對這類站要明確回「此站只支援 bridge 通道」，不嘗試空 token 請求。
3. 介面上網站清單的標示：能分辨是哪個客戶的哪個站（沿用既有選單元件的顯示方式，不新增下拉）。
4. 既有站（Soulful、AwareWave）在每一處的行為與輸出不變（既有測試不改；舊資料測試）。

## 驗收
- vitest：每個改到的呼叫端一個「已登記站出現在清單／可取得客戶端」的測試與一個「已登記站載入失敗不退回預設」的測試；既有 env 測試全綠。
- 突變一次：把「載入失敗不退回預設」改成退回 → 指名測試變紅 → 還原變綠。
- `npx tsc --noEmit`；全套 `npx vitest run`。

## 邊界
不改 `woo.ts` 既有環境變數客戶端的行為；不連主機、不打真的網站；線4 同時在做 SF-P（刪 `/onboard`、`/build` 與搬兩個分頁到客戶頁，會改 `app/(shell)/ops/clients/[slug]/` 與側欄），不要碰那些檔。不 push。
