# codex-oracle review -- 2026-11-15 16:29:29 +08:00

- mode: `review`
- scope: -Path lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/codex-laptop/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/CodexLaptopButton.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CodexQuotaCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/image-errors.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, scripts/codex-image-worker.mjs, scripts/codex-image-worker-install.ps1  <-- PARTIAL: does not satisfy the ORACLE gate
- target: `working tree (staged + unstaged + untracked)`
- context: (none given)
- exit: 0 | elapsed: 165186ms | answer: 1599B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/layout.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/costs/CodexQuotaCard.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/CodexLaptopButton.tsx, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/content/image/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/codex-laptop/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/tools/tarot/generate/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/studio/image-errors.ts, scripts/codex-image-worker-install.ps1, scripts/codex-image-worker.mjs
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 一鍵啟動依賴的密鑰未由安裝流程提供
  file:line   -> scripts/codex-image-worker.mjs:34
  confidence  -> CONFIRMED
  scenario    -> 這台筆電目前沒有 HKCU 的 `CODEX_WORKER_SECRET`；若瀏覽器啟動時也尚未取得該環境變數，點「啟動筆電」後，工人讀不到密鑰並在第 184 行退出。安裝腳本只註冊 URL 協定，沒有設定密鑰。
  why missed  -> 手動測試工人時，目前的 Codex 程序已有該密鑰；由瀏覽器啟動的程序不一定繼承同一份環境。

FINDING 2: 閒置退出後，伺服器仍會暫時宣稱工人在線
  file:line   -> scripts/codex-image-worker.mjs:189
  confidence  -> CONFIRMED
  scenario    -> 工人在最後一次空白 claim 後達到 30 分鐘門檻並退出；claim 同時更新了伺服器的 `lastPollAt`。接下來最多 45 秒，狀態 API 仍回 `online: true`，新生成請求會入列，卻沒有工人領取，最後逾時。
  why missed  -> 退出計時在筆電，45 秒在線判定在未修改的伺服器橋接程式，兩者未一起檢查。

FINDING 3: 同時啟動可越過單實例鎖
  file:line   -> scripts/codex-image-worker.mjs:167
  confidence  -> CONFIRMED
  scenario    -> A 以 `wx` 建立鎖檔、尚未寫入 PID；B 此時讀到空檔，將它視為過期並刪除，再建立自己的鎖檔。A、B 都從 `takeLock()` 回傳成功，兩個工人同時領圖，破壞一次只畫一張的限制。
  why missed  -> `wx` 只保證建立檔案具排他性；後續寫入 PID 與另一程序的過期鎖判定之間仍有競態。

TOTAL: 3 findings
