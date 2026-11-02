---
slug: outbound-v2-handoff
created_utc: 2026-11-02T06:24:34Z
hint: "外聯 v2 交接給另一個 Claude 帳號（看不到監工台 artifact）"
source_session_summary: "Outbound OS v2: all code-only cards shipped to prod; remaining = operator steps + REALTEST waiting on real data"
---

**續接語**：「續做外聯系統 v2：讀 $WORK_ROOT/agency-os/handoffs/2026-11-02-1424-outbound-v2-handoff.md，從 §5 步驟 1（讀狀態並重新發布監工台給操作者）開始；完成 = data.mjs 剩下的 todo 全部 done。建議模型：Opus 5.5」

### 1. 任務目標
外聯系統 v2（冷開發信）：研究名單 → 產信 → 核准 → Gmail 草稿／自動寄 → 回信同步 → 追蹤信 → 暖名單進 FluentCRM。目標每天 300 封（SPEC D21）。進度 61/77 項。

### 2. 為什麼做
操作者的產品線。程式已全部上線；剩下的是操作者手動步驟，以及要有真實資料才能驗收的項目。

### 3. 已試過（=已完成，全在 prod）
- 正式站 next-admin = `b0f5e4872`（主機 `/root/lobster-phase1/.deployed-commit`）。之後外聯相關的 commit 都只動文件（32c9396c0 是另一個 session 的 mockup 修正，還沒部署）。
- Migration 0152 sender_pool、0153 co_replies、0154 meta leadgen 唯一索引：都已套正式庫。
- 主機 cron：`outreach_sender_health`（00:30 UTC）、`outreach_gmail_sync`（每 10 分；自動寄也跑在這個 tick 裡）。
- 已完成的卡：C1–C5、C7、C8、C10–C17 的程式部分。wp-bridge 0.21.0 已發版，裝在 aware-wave.com 和 Soulful。
- 每張卡的根因、驗證、commit：見 `agency-os/WORKLOG.md` 2026-11-02 續11–續44（grep `外聯`）。

### 4. 卡在哪（全部等操作者或真實資料）
| 項目 | 等什麼 |
|---|---|
| C1.6 → C4.7 | 操作者在 Google Console 按發布＋到 Connectors 頁重連 Gmail（目前 gmail_sync 回 502 `invalid_grant`）；品牌驗證：操作者 11-03 回 Console 按「我已解決問題」 |
| C11.1 → C11.4、C8.5、C5.5、C15.4、C7.3、C16.4 | 操作者買獨立新網域（不是 aware-wave.com 的子網域）＋新開一個 Workspace（不用現有帳號）＋每個網域 2 個信箱＋DNS；Connectors 頁填 Hunter 或 ZeroBounce 金鑰（沒有金鑰＝不會自動寄） |
| C12.3 | 操作者把 GCIS 告知書寄到 opendata.gcis@gmail.com，IP 填 145.239.195.47（https://data.gcis.nat.gov.tw/od/rule） |
| C13.4 | Hunter 金鑰 |
| C14.3 | 操作者在 Meta App 開 `leads_retrieval` 權限＋每個品牌頁面訂閱 leadgen |
| C6.4 | 操作者 11-02 決定：**不要**把 aware-wave.com 的 bridge 接回 app（10-30 已切斷）；先放著 |
| C9、C16.2 | 要 100 個名單走過研究流程；要寄滿 200 封 |

### 5. 下一步指令
1. 讀狀態：`$WORK_ROOT/agency-os/handoffs/2026-10-31-outbound-os/data.mjs`（監工台唯一資料來源；每項 `todo(...)`／`done(...)` 都附 commit）。**開工第一件事：重新發布監工台給操作者看**（操作者要看）：`node build.mjs` → 用 Artifact 工具發布同目錄的 `supervisor.html`（新網址；原本的 claude.ai DbH1HLUihZwAiBiJZGSD4t 在另一個帳號，這邊打不開）→ 把新網址給操作者 → 新網址寫進本檔這一行和記憶 `project_outbound_os_v2_supervisor.md`。之後每次改 data.mjs 都重發布到同一個網址。
2. 規則與合約：`$WORK_ROOT/agency-os/docs/Outbound_OS_Engineering_Spec/Outbound_OS_Engineering_Spec.md`（I1–I10 不變量、D1–D25 決策）。卡片細節：同目錄 `R0-PLAN.md` §6。
3. 操作者回報某個前置做好了 → 做對應的 REALTEST，把 data.mjs 該項改成 done（附證據）→ `node check.mjs` → `node build.mjs` → 重新發布 → WORKLOG。
4. 部署：照 AGENTS.md §0 走 `/check-drift` → 主機 `sg-deploy.sh next-admin`（ssh 指令首行要加 `# CONFIRMED-HIGH-RISK:`）。驗收跑**全套** `npm test`（11-02 只跑子集，部署閘擋了兩次）。

### 6. 相關資源
- **Files**：`$WORK_ROOT/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/outreach/`（sender-pool.ts、send-adapter.ts、gmail-sync.ts、sources/gcis.ts…）、`lib/outreach/google-oauth.ts`（唯一碰 Gmail API 的檔，`lib/outreach/__tests__/never-sends.test.ts` 守著）、`lobster-factory/packages/db/migrations/0152`–`0154`、`lobster-factory/infra/hetzner-phase1-core/scripts/cron.d/awarewave-schedules`。
- **Commits**：050a1041e C8+C7、d518cbb2c C5、96ecf614d C15、8c8713c8b C15 修正、6c9f2a8c8 C12、1c47a2904 C13、f57fd3512 C6、27a93dbcc C14、b0f5e4872 C16＋部署、077f28800 收尾。
- **操作者規則**（不在 repo 的部分）：
  - 給操作者看的一律繁中、短；中途進度不報，只在完成或需要她時報。
  - 給 worker 或 AI 的報告、WORKLOG：極簡條列。
  - 需要部署就馬上部署，或幾張卡一起部署；不要等每天 03:00 的自動部署。
  - 不要跟操作者要金鑰（金鑰在 `mcp/user-env.ps1`）。
- **地雷**：
  - aware-wave.com 只當 WordPress 用，app 的連線 10-30 已全部切斷，沒被要求就不接回。
  - awarewaveai@gmail.com 是主信箱，只能用草稿模式，絕不自動寄（SPEC D17、I10）。
  - 不要重提 SPEC 已否決的項目：canvas、n8n、開信追蹤、抓 IG／FB／LinkedIn、買名單、對個人消費者寄冷信。
  - 共用工作樹：commit 一律帶 pathspec；WORKLOG／TASKS 只能用 `scripts/git-partial-worktree-commit.py stage` 提交。
