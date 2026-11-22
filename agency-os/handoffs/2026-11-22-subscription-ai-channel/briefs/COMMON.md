# 共用規則（每張卡先讀；再讀 `../PLAN.md` 全文與自己的卡）

- 身份：全能規劃師＋頂尖工程師（架構／DevOps／資安／DB）。完整理解現有邏輯再改；不補丁、不畫蛇添足、最乾淨的 code；可驗證、可回滾、像 LEGO 可加可拆。每個發現附 `file:line`，不寫「可能是」。先讀 repo 根 `CLAUDE.md`、`agency-os/AGENTS.md`。
- App root：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。卡內相對路徑以此為根；`scripts/` 指 repo 根。
- PLAN §2 的不變量 I1–I7 與 §3 的 wire contract 是合約：照寫，不自行改名、改形狀。發現合約有錯 → 停，回報，不自己改。
- 只動卡片「檔案」節列的檔。不改檔名、不改 URL、不重構卡外的東西（PLAN §3 改名債已決定不做）。要改的檔整檔讀，其餘 grep。
- 既有行為：Codex 生圖（`codex-image`）的對外行為與既有測試斷言不得改變；既有 API 文字路徑逐位元不變（沒選訂閱模型時）。
- Git：在自己的 worktree 做（`D:\Worktrees` 底下），先 `git fetch && git rebase origin/main`；commit 帶 pathspec，每個小步一個 commit；不 push、不動 `main`、不改 `agency-os/WORKLOG.md`／`TASKS.md`、不改本資料夾的 `data.mjs`／`supervisor.html`；不部署、不 SSH、不碰正式資料庫。worktree 的 next-admin 先 `npm ci`（不要建 junction 連別處的 `node_modules`）。
- 關 dev server 只關自己開的 PID／port；禁止 `taskkill /IM node.exe`。`next-env.d.ts`、`tsconfig.tsbuildinfo` 被工具改動要還原。
- 不要呼叫 Codex（額度到 2026-11-24 11:02 才恢復；`scripts/oracle-quota.ps1 -Action check -Tool codex` exit 3）。不跑 `/codex-review`；審查由監工整批做。
- 測試：不做無效益測試：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。測試產物放 `$env:TEMP`。
- 驗收指令：`npx tsc --noEmit`、`npx vitest run <受影響路徑>`（不跑全套）；有畫面的卡用 `.claude/launch.json` 的預覽實際開頁面看一次。
- UI：沿用 `app/globals.css` 既有 class 與主題 token，零色碼；不用下拉，選項用看得到的按鈕；金額一律 NT$。
- Context：大輸出導檔再取。context 滿了由系統自動壓縮；壓縮後重讀本檔、PLAN、自己的卡與 `../progress-<卡號>.md` 續做。每完成一小步在 `progress-<卡號>.md` 寫三行內進度（做完哪步／下一步／卡住什麼）。一張卡做完就停，不自己接下一張。
- 回報（只要這幾行，不寫敘事；回報操作者一律繁體中文）：
  `FILES:` 改動檔
  `TESTS:` 指令＋結果
  `COMMITS:` 短 hash
  `RISKS:` 每條一行，沒有寫「無」
  一句結論
