# codex-oracle review -- 2026-11-19 13:40:21 +08:00

- mode: `review`
- scope: whole repo
- target: `64557bb77..bb387dc39`
- context: SOC-REAUTH (2 commits): every social send failure now carries an actionable Chinese reason; social_accounts.status mirrors Postiz's own Integration table (refreshNeeded/disabled/inBetweenSteps/deleted -> expired, healthy+expired -> connected) via host script social-channel-health.sh every 5 min POSTing to /api/internal/social/channel-health (SOCIAL_DISPATCH_TOKEN); dispatcher refuses to call Postiz for an expired/disabled account; old daily reconcileAccounts removed; reconnect completes only when the mirror confirms. Check: incident resolve by direct ops_incidents update, empty-table guard, conditional status update, token handling in the shell script, and anything that could flip every channel to expired on a bad read.
- exit: 0 | elapsed: 171176ms | answer: 2540B
- files-reviewed: lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/channel-health/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/channel-health/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/rotation/route.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/internal/social/rotation/route.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/__tests__/host-schedules.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/schedules/host-jobs.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/channel-health.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/__tests__/dispatch.test.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/channel-health.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/review.ts, lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts, lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules, lobster-factory/infra/hetzner-phase1-core/scripts/social-channel-health.sh
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 新增的五分鐘頻道檢查不會隨自動部署啟用
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules:28`
  confidence  -> CONFIRMED
  scenario    -> 提交進入 main 並完成 next-admin 自動部署 → `sync-host-scripts.sh:67-88` 只把 cron 檔複製到 `/root/lobster-phase1/scripts/cron.d`；實際排程須由 `install-host-schedules.sh:114` 安裝到 `/etc/cron.d` → 新工作不會執行，舊的每日對帳又已移除。
  why missed  -> 新增條目與腳本的檢查只驗證 repo 內容，沒有涵蓋主機的 cron 安裝步驟。

FINDING 2: 已連接頻道按「重新連接」後，可在完成 OAuth 前被判定成功
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/store.ts:334`
  confidence  -> CONFIRMED
  scenario    -> 頻道目前是 `connected`，操作者按重新連接，但尚未完成平台授權 → `startConnect` 建立 attempt 時未改帳號狀態（`store.ts:378-400`）；下一次 GET 呼叫 `resolveConnectAttempt`，原有 Integration 仍列出且未停用 → attempt 立即結束並回報 `justConnected`。
  why missed  -> 修改了完成條件，卻把原本就可能是 `connected` 的狀態當成「本次鏡像已確認」的證據。

FINDING 3: 發送器先標記失效時，頻道授權事件不會建立
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:245`
  confidence  -> CONFIRMED
  scenario    -> Postiz 已停用頻道，發送排程先於健康檢查執行 → 發送器將帳號改為 `expired`；健康檢查隨後因 `channel-health.ts:36` 只處理「尚未 expired」的失效帳號而略過 → 不會建立 `social:account:<id>` 授權事件。發送器建立的是另一個 `social:post:<id>` 事件（`dispatch-store.ts:122`）。
  why missed  -> 兩條路徑都能改帳號狀態，但建立頻道事件只綁在鏡像的狀態轉換上。

FINDING 4: 貼文組裝失敗仍直接寫入英文錯誤，違反每次失敗都有中文操作指引的要求
  file:line   -> `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/social/dispatch.ts:253`
  confidence  -> CONFIRMED
  scenario    -> 已排程的貼文沒有文字或媒體 → `compose.ts:121` 擲出 `nothing to send: no text and no media` → 發送器原樣寫入目標錯誤，沒有中文原因或下一步。
  why missed  -> 修改集中於 Postiz 回覆及頻道狀態，漏看 Postiz 呼叫前的組裝失敗路徑。

TOTAL: 4 findings