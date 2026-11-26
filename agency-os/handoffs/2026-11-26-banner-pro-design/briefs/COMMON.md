# 共同規則（每張卡都適用）
- 規格正本：../PLAN-R2.md（§2 根因 file:line、§4 已代決、§5 你的卡）。先整檔讀你要改的檔，再動手；行號以 main 9854e4be1 為準，動手前 grep 確認。
- 只改你那張卡列出的檔。其他卡的檔不碰；需要時寫進 RISKS。
- 程式最乾淨：不留舊路徑、不加用不到的選項、不做補丁式繞路；要重寫就重寫並說明刪了什麼。code comment 只寫未來會踩的坑，1–3 行。
- 不做無效益測試：只寫卡片點名的測試；突變只做在隱私／可見範圍／擦除／同意／擁有權的守衛，一個守衛一次。
- 驗證：`npx tsc --noEmit`（next-admin 目錄）綠；`npx vitest run "app/(shell)/tools/banner" lib/script-forge` 綠；介面卡另在本機 dev 開頁面看（preview_start）並截圖存 $env:TEMP。
- commit：在你自己的 worktree branch 上，一張卡一個 commit，message 含根因＋驗證，結尾 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。不 push main、不部署、不改 WORKLOG／TASKS（監工做）。
- context 變長（>60%）：先 commit 已完成部分，回報監工，停下；監工會 clear 後派下一步。
- 回報只要三行（回報操作者一律繁體中文）：
  FILES: <改的檔>
  TESTS: <跑的指令與結果數字>
  RISKS: <每條一句：交辦單沒寫到的行為、沒驗到的地方；沒有寫「無」>
