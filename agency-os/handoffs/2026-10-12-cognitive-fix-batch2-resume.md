# 認知平台第二批修理：斷電接手點（2026-10-12）

全部改動都已經 commit 在 `D:/tmp/fix2-merge`（detached，還沒 push）。HEAD 是 05a9268e9，從 origin/main ed1eee479 往上：
3dacaa6ce nginx 真實 IP＋照人限速 · 5ff1a2b60 Cloudflare runbook · 76eef68e5 蒐集器 Brave／法規頁原因 · a0a9ee235 平台主機 W2–W24 · 2b214cb45 網頁 W7–W22 · d3f9df911 12 個 AI 按鈕改程式 · 05a9268e9 1000 人容量。

**斷電中止的 worker**：「Finish capacity」，工作區 D:/tmp/fix2-merge。它的工作是：
1. 網頁 catalog 快取，不夠就加第二份 web
2. cognitive-db 的 max_connections 改 150、記憶體改 1g
3. 一個 Alembic migration，補 ai_usage 和 interpretation_events 的索引
4. 登入時的 `_most_accounts_per_address` 改成不要全表掃描
5. visibility.led_cases 只查本人
6. PyYAML 改用 CSafeLoader
7. 用 1000 人重壓：要包含 nginx 和同一 IP 的一整班

它的 brief 在本 session transcript。新 session：先 `git -C D:/tmp/fix2-merge status`，看它改到哪，補完未做的，再壓測。主機上若留有 `cos-load` compose project，要 down -v（只拆那個 project）。

之後：
- 合併後跑一次 affected tests（`--base ed1eee479`）＋ web vitest/tsc ＋ next-admin collect vitest。
- WORKLOG（私有 index）→ push。
- 請操作者說「部署」：
  1. COS `deploy.sh`（含 migration）
  2. next-admin `sg-deploy`
  3. nginx：`safe-infra-patch` nginx 型，套 `lobster-factory/infra/hetzner-phase1-core/nginx/default.conf`（repo 已補上 live 的 hci 區塊）
  4. cognitive-db 重啟，改連線數
  5. `deploy/.env` 設 `COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET_PER_PERSON=50000`、`COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET=2000000`（操作者已同意）
- 部署後重走改到的地方；刪兩個測試案子要操作者自己按；多人共同程序要操作者開第二個帳號。

已做、未 commit 在 D:/Work：
- `agency-os/docs/architecture/decisions/015-awarewave-account-and-shared-wallet.md`（＋ADR_INDEX、ADR 002 註記）
- `Projects/internal/cognitive-engineering-os/docs/platform/AI_TO_CODE_AUDIT.md`（fix2-merge 裡有更新版，以那份為準）
- `PLATFORM_ENTRY_AND_READING_MAP.md` 連結
- Cloudflare 規則已在正式站改好：排除 cognitive；改前存檔在 scratchpad `cf-rule-before-20261012.json`。

操作者已定：
- 點數照用量扣、不退、全站一個錢包（ADR 012 帳本）
- 新註冊送 NT$30
- 能用程式就不用 AI
- 300～1000 人同時用要沒問題
