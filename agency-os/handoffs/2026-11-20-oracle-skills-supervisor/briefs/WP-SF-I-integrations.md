# SF-I 接上 MainWP 與 wp-bridge（建站第 6、7 步）

先讀：`COMMON-WP.md`、`SITE-FLOW-COMPLETION-PLAN.md` §0（I1–I6，特別是 I4 私鑰不出程序）、§1-3 表的 MainWP 與 wp-bridge 兩列（`:54-55`）、§1-4、§3 的 SF-I 列（`:139`）。`NA`＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin`。整檔讀：`NA/lib/site-flow/{types,engine,gate-client,records}.ts`、`NA/lib/site-flow/steps/`（SF-H 已在 main `6b473629c`；照它的寫法）、`NA/lib/payments/woo.ts`、`lobster-factory/packages/workflows/src/integrations/integration-steps.ts`（既有 `addSiteToMainWp` 與 `mainWpConfigFromEnv`）、`lobster-factory/infra/hetzner-phase1-core/scripts/aw-hosting-gate.sh` 的 `site-wp` 段（`set-mainwp-id`、`put-bridge-pubkey` 的參數與輸出）、`lobster-factory/packages/wp-bridge-plugin/includes/Admin/AdminPage.php`（金鑰表欄位）。模型 Opus 5.5（憑證：完成後派兩個獨立的 `critic` Deep，逐條重新推導；並做突變）。

## 目的
新網站建好後自動加進 MainWP，並建立後台與網站之間的簽章通道，同時登記這個網站屬於哪個客戶。不變量：(1) 私鑰只存在 next-admin 程序與保管庫，不出現在任何 log、run output、回應、主機指令參數；(2) 一個網站只屬於一個客戶，登記錯了寧可失敗不可寫錯；(3) 步驟「完成」只由實際觀測決定（MainWP 裡真的有且連線正常；簽章請求真的 200）。

## 已知事實
- 後台容器已有 `MAINWP_DASHBOARD_URL`、`MAINWP_CONSUMER_KEY`、`MAINWP_CONSUMER_SECRET`（SF-I0，2026-11-22 以 `docker exec lobster-next-admin printenv` 驗過存在）。本機測試一律用假 MainWP，不打真的。
- 步驟登記表在 `NA/lib/site-flow/steps/index.ts` 的 `HOST_STEPS`；你的兩步各加一行。步驟鍵 `mainwp`、`bridge` 與 catalog 鍵 `site.mainwp`、`site.bridge` 已存在（migration 0176，皆關）。
- 閘門子動詞 `set-mainwp-id`、`put-bridge-pubkey` 已存在；docker 站不收 stdin。staging 子目錄站的轉接層目前只有 `set-mainwp-id` 與 `plugins`（SF-G 回報）。
- 既有站（Soulful、AwareWave）的 wp-bridge 設定走環境變數；`woo.ts:84-158` 讀它們。

## 要做
照 SITE-FLOW `:139` 與 `:54-55`，一項不少：`NA/lib/site-flow/steps/{mainwp, bridge}.ts` 並登記；bridge 步驟完成時寫 `wp_sites` 一列（組織歸屬，§1-4）；`woo.ts` 在環境變數之外加讀已登記的站（環境變數那條路的行為與輸出不變）。補充要求：
1. MainWP：先經閘門在站上設 unique id，再呼叫加站。MainWP 已有該網址時視為已完成並取回站 id（不重複加）。站 id 寫入 `environments.metadata.mainwp_site_id`。觀測＝MainWP 回報該站存在且連線正常。可重用 `integration-steps.ts` 的邏輯時，抽成 next-admin 可引用的形式，不複製一份。
2. wp-bridge：金鑰對在 next-admin 產生；公鑰經 `put-bridge-pubkey` 寫入站上；私鑰寫入保管庫（沿用專案既有的保管庫介面，先 grep 找出 `client_credentials` 與 Vault 的現行寫法，照做）；`key_id` 已存在就不重產。觀測＝用該私鑰簽一個 `/health` 請求得到 200 且版本相符。
3. `wp_sites` 寫入：組織取自這個站的 `sites.organization_id`，不接受呼叫端傳入；已有同網址而組織不同的列 → 失敗並說明，不覆蓋。既有列（Soulful、AwareWave、E2E-Verify-0704）不被改動（舊資料測試）。
4. 失敗與重跑：公鑰已寫入站上但私鑰存保管庫失敗時，不得留下「站上有鑰匙、後台沒有」而顯示完成；重跑要能收斂（重產並覆寫公鑰，或清掉站上的鑰匙）。rollback 的做法寫明。
5. staging 子目錄站需要的轉接（`put-bridge-pubkey` 等）：需要就補在 `gate-client.ts` 的轉接層並加測試；發現閘門缺東西時停下回報，不自己改 `aw-hosting-gate.sh`。
6. 頁面：第 6、7 步現在顯示「尚未提供」，登記後要有內容；`tests/e2e/sites/site-flow.spec.ts` 裡照實斷言「只有這兩步尚未提供」的那條改成九步都有內容。

## 驗收
- vitest（假 gate、假 MainWP、假保管庫）：上列 1–5 各至少一個測試；SITE-FLOW `:139` 點名的「`bridgeSiteOrg` 對新站回該組織（不是全域模式）」「`woo.ts` 既有 env 測試全綠＋新增 DB 站測試」「私鑰不進任何 log」。
- 私鑰外洩斷言：整個步驟跑完後，run 的 input、output、error、console 輸出、送往閘門的參數裡都查不到私鑰內容（用一把測試金鑰的固定片段 grep）。
- 突變三次（各一個守衛）：把私鑰放進 run output；`wp_sites` 的組織改成取呼叫端傳入的值；拿掉「同網址不同組織就失敗」→ 指名測試變紅 → 還原變綠。
- `npx tsc --noEmit`；**全套** `npx vitest run`；Playwright `--project sites` 全過。
- SITE-FLOW 寫的「staging 子目錄站實跑、MainWP 出現且 connected」需要連主機與真的 MainWP，不在本卡；由監工在 SF-L 做。

## 邊界
不連主機、不打真的 MainWP、不寫真的保管庫；不開 catalog 開關；不改主機腳本；不 push。這張卡會隨今晚 03:00 自動部署上線：兩步的開關都是關的，上線後不得有任何路徑在開關關著時動到 MainWP 或保管庫（加一個測試守住）。
