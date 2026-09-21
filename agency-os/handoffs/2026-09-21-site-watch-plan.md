---
slug: site-watch-plan
created_utc: 2026-09-21T05:00:00Z
hint: "網站巡檢（Playwright）計畫，操作者已同意設計方向，實作待 go-ahead"
source_session_summary: "Entity dossier + self-hosted renderer 上線後，操作者問 Playwright 還能用在哪；決定做客戶網站巡檢"
---

## 1. 任務目標
客戶網站巡檢 = site-watch。每客戶可開關，新客戶預設開。Phase 1 只做公開頁面：打開、JS 錯誤、截圖比對。

## 2. 操作者已拍板（不要重問）
- 設定入口 = 客戶頁 `/ops/clients/[slug]` 一張「網站巡檢」卡片；按鈕/核取方格，禁下拉；多選。
- 新客戶預設開，每天 1 次；電商與 app.aware-wave.com 每小時。頻率 chips：每小時／每 6 小時／每天／只在更新時。
- 正常不出聲、不產日報；失敗才 Telegram（同一問題一次，恢復一次，連續 2 次失敗才報）。週摘要預設關。
- 不留垃圾：基準圖每頁只留最新 1 張；正常結果只記一行、30 天自動刪；失敗證據 30 天自動刪。
- 總覽表列全部網站狀態，未開巡檢者標黃。
- 負擔上限：容器記憶體／CPU 設死上限，全域 kill switch。

- 自建網站接入：唯一動作 = 在系統新增客戶（填網址）；onboard wizard（`app/(shell)/onboard/OnboardWizard.tsx`，已有 Uptime Kuma 等整合清單）加「網站巡檢」項，預設勾。安全網：總覽表列出「MainWP 有、系統沒有」的網站（next-admin 目前無 MainWP 站點清單讀取，需新增唯讀 MainWP API 讀取，P1 末或 P1.5）。

## 3. 重用（已查證，不建新輪子）
- 排程：照 collection-schedule 模式。`lib/collect/schedule-store.ts` + `schedule.ts isDueNow` + `app/api/internal/collect/run-due-schedules/route.ts`（專用 bearer token、lastRunAt 成功後才寫）+ Trigger.dev 每小時 heartbeat `packages/workflows/src/trigger/collect-scheduled-crawl.ts`。
- 通知：失敗 = 開 ops-inbox incident，恢復 = resolve；`lib/ops-inbox/notify/dispatcher.ts:34 dispatchNotifications` 已有 Telegram 與 transition 去重語意。
- 瀏覽器：Phase 1 只看公開頁、零憑證 → 在現有 renderer 加 `POST /snapshot`（截圖 + console errors + status），沿用同一隔離（egress policy、非 root、無 caps）。不另開容器。
- 基準圖儲存：`lib/storage/r2.ts`。
- 設定存放：`organizations.metadata.client_config.site_watch`（同 collection／chatwoot 慣例）。
- 更新前後比對：掛進 `app/api/ops/clients/[slug]/wp-update/route.ts`（SSE），更新前 snapshot、更新後 snapshot + diff，超門檻 → log 警告 + incident。
- 既有 e2e `tests/e2e/client/wp-site-health.spec.ts` 保留當手動工具，不搬進 prod。

## 4. 修正既有錯誤說明
`scripts/playwright-runner.ps1` 檔頭寫 sg-deploy 會呼叫它 = 假（sg-deploy.sh 無 playwright，GHA 亦無）。Phase 1 改檔頭為實況。

## 5. 分期
- P1：renderer `/snapshot` + 像素比對（pixelmatch）+ 設定卡 + 總覽表 + 排程 + incident 通知 + 30 天清理 + wp-update 前後比對。
- P2（另開容器，帶憑證）：登入後流程（app.aware-wave.com 登入、表單送出、購物車）。憑證走 secret vault，只准連自己與客戶網域。
- P3：sg-deploy 後瀏覽器 smoke（JS 錯誤 → rollback）。

## 6. 風險等級
High：renderer 新 endpoint 上線、compose 不變、Trigger.dev deploy、可能 migration（若改用表不用 JSONB）。需操作者 go-ahead，首行 `# CONFIRMED-HIGH-RISK:`。

## 7. 下一步（接手照做）
1. 讀本檔 + `git log --oneline -10`。
2. 出 R0 七段（依本檔 §3 已查證事實），等 go-ahead。
3. 實作 P1，驗證四動作，critic 1 個。
