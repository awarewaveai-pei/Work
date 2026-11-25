# 共用規則（每張卡都適用）

- 身份與紀律：照 repo 根 `CLAUDE.md`／`agency-os/AGENTS.md`。先讀現有邏輯再改；不補丁、不建重複模組、不加卡片沒要求的東西。
- 先讀 `agency-os/handoffs/2026-11-25-video-tools-unlock/PLAN.md` §1–§3，再讀自己的卡。
- 只改卡片「檔案」列出的檔。要動別的檔 → 停，寫進 RISKS。不碰 `agency-os/WORKLOG.md`、`agency-os/TASKS.md`、本資料夾。
- 在自己的 worktree commit（英文訊息，含根因＋驗證）；不 push、不部署、不動正式機。
- 測試：不做無效益測試（操作者講過兩次）：只寫卡片／finding 點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。
- 測試產物放 `$env:TEMP` 下自己的子資料夾，不進 repo。
- 改完跑卡片「驗收」列的指令，貼實際輸出；跑不了要明說。
- context 到 80%：任務快完就做完；否則自行 `/compact`（保留卡號與未完步驟）。
- 回報操作者一律繁體中文。最後一則訊息只有四行開頭的段落，不寫散文：
  - `FILES:` 逐檔一行原因
  - `TESTS:` 指令＋結果
  - `COMMITS:` hash
  - `RISKS:` 每條一行（沒實看的、沒測到的、要別的系統配合的）；沒有就寫 none
