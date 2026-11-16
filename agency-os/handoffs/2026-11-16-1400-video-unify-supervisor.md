---
slug: video-unify-supervisor
created_utc: 2026-11-16T06:00:00Z
hint: "影片工具融合監工：換帳號接手"
source_session_summary: "監工派工 U0–U11（舊影片工具併進影音工作台）；U0/U1/U4/U7 已在 main，第二批驗收中"
---

**續接語**：「續做 影片工具融合監工：讀 `$WORK_ROOT/agency-os/handoffs/2026-11-16-1400-video-unify-supervisor.md`，從 §5 第 1 步開始；完成 = 監工台 36/36、工作台部署經我同意。你是監工派工者，最多 4 個工人 session，回報一律繁中。建議模型：Fable 5.2」

### 1. 任務目標
舊影片工具（next-admin `/tools/video`、`/tools/script-forge`）併進影音工作台，結果一個工具。計畫正本 `lobster-factory/infra/hetzner-phase1-core/apps/video-workbench/docs/video-unify-plan-20261116.md`（§4 卡 U0–U11；檔首十條操作者前提全部定案，不再問她設計題）。

### 2. 為什麼做
操作者 2026-11-16 定案。她只看監工台：https://claude.ai/artifact/44ZLNFx32ZtLhQniaM79S5（另一帳號打不開就用 `supervisor.html` 重新發布一頁，把新網址寫進 `data.mjs` 的 `META.url`）。

### 3. 已試過（狀態）
- 在 origin/main：U0 `79ab5f321`、U1 `dd64b4a18`、U4 `df5640559`（U4.4 FLUX 選模型未做：工作台無 FLUX 文生圖供應商模組）、U7 `ea91b5819`、登記表補洞 `880a7943d`。migration 0164 已套正式庫。next-admin 隨 03:00 自動部署；**影音工作台未部署（High，要操作者 go）**。
- 第二批（各在自己分支，未併入）：
  - U10 `98d5619d6` 分支 `claude/recursing-jang-f14f2d`：已 commit；RISK「計費組織 ID 需後端改動」未判。
  - U8 `37642ebfc` 分支 `claude/reverent-goldwasser-fd865d`：已 commit（該 worktree 的 gate 只因缺 opencc-js 紅，整合 worktree 重跑）。
  - U2 `c78dd24cb` 分支 `claude/elegant-shirley-877971`：已 commit；Playwright 畫面比對沒跑（原生頁 vs 門頁 computed style），驗收時補或列風險。
  - U5 commit 1 `06ba109d7` 分支 `claude/elated-darwin-0aaa98`：已 commit；Codex F1、F3 列為已知風險未判（讀該 commit message）。
- risks 清查：`agency-os/handoffs/2026-11-16-video-unify-supervisor/risk-triage-u0-u1-u4-u7.md`（在 `D:\Work`，未 commit）— 現在修 0、後面卡處理 4、不用處理 21。
- `D:\Work` 落後根因已修（`scripts/git-parity-merge.py`：上游舊快照規則＋eol=crlf 檔由 git 寫回），`D:\Work` 已 0/0。

### 4. 卡在哪
無阻塞。待操作者決定：(a) 工作台部署；(b) U7 客戶沒設定時音檔預設「可外送」是否改成預設擋。

### 5. 下一步指令
1. 整合一律在 worktree `D:/Worktrees/Work/u-integrate`（detached，`git fetch origin && git rebase origin/main`）；`D:\Work` 有別的 session 的未提交改動，不在那裡 cherry-pick。
2. 逐張驗收第二批：`git diff origin/main...<分支>` 讀 diff → `git cherry-pick <commit>`（`tests/gate.cjs` 的測試清單是一整行，必衝突：保留 HEAD 清單再加新測試名）→ 在整合 worktree 跑 `node tests/gate.cjs`（video-workbench）、`npx tsc --noEmit`＋`npm test`（next-admin）→ `git push origin HEAD:main`。工人分支若沒 commit：該分支的 worktree 在 `D:/Worktrees/Work/<名>`，另一帳號開新 session 進該資料夾續做，或把卡重派。
3. 每併一張：改 `agency-os/handoffs/2026-11-16-video-unify-supervisor/data.mjs`（`todo(` → `done(id, 文字, commit)`；卡的 `status` 由完成項數決定，check 會指出）→ `node build.mjs && node check.mjs` → commit、push → Artifact 重新發布同網址。工人的 RISKS 全部上監工台。
4. 之後派工順序（計畫 §4「順序」、§7 模型）：U3、U6（需 U2）；U5 commit 2、3；U9（需 U3）；U11 最後。順手把 `tests/gate.cjs` 清單改成一行一個（等沒有工人在動工作台時做）。
5. 工人 brief 樣板：見本 session 已派的八張（背景＋「只做一張卡、commit 在自己分支、不 push 不部署、回報 COMMIT/FILES/TESTS/RISKS/白話、context 80% 自己 /compact」）。新工人的 worktree 從本機 main 切，`D:\Work` 現在已對齊。

### 6. 相關資源
- **Files**: 計畫（上）；監工台 `$WORK_ROOT/agency-os/handoffs/2026-11-16-video-unify-supervisor/`；規則記憶 `feedback_supervisor_dispatch_up_to_four_sessions`、`feedback_everything_on_supervisor`。
- **Known landmines**: 整合 worktree 有 node_modules junction（next-admin、video-workbench）與複製來的 `vendor/` 忽略檔，刪 worktree 前先移除 junction；新內部路由要過 `lib/portal/__tests__/registry-code.test.ts`；WORKLOG 今日條目尚未寫（AO-CLOSE 時補：U 線四張卡＋parity 修正，證據在各 commit message）。
