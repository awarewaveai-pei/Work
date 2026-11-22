# W10 「立即更新」「新增系統」介面（Sonnet 5.5）

先讀 `COMMON.md`（契約 3）、`reference/ops-systems-prototype.html`、現有 `app/(shell)/ops/systems/{page.tsx,actions.ts}`。後端（W9）已提供 `requestRefresh`、`proposeSystem`、`readPending`（`lib/systems/store.ts`）。

做：
1. 頁首右側兩顆按鈕，位置照原型。
   - 「立即更新」：server action → `requestRefresh`；按完顯示「已排入，約 5 分鐘內更新」；已有待處理請求時按鈕改成「更新排隊中」並停用。
   - 「新增系統」：展開表單（名稱、類型用五個按鈕選、一句用途），送出 → `proposeSystem`；不用下拉。
2. 「資料同步狀態」卡加一行：有待處理請求時顯示「已排入更新（按下時間）」。
3. 「所有系統」表上方或右欄加「待登記」清單（`readPending().proposals`）：名稱、類型、用途、提出時間，註明「下一次 agent 開工時會寫進系統清單」。
4. server action 都先過 `systemsAccess`（照現有 actions.ts）；輸入長度驗證交給 contract。
5. 主題 token、零 hex、不用下拉。

測試（只寫這些）：兩個 server action 非 owner／admin 被拒（一次突變：拔守衛→紅→還原）。跑 next-admin 全套 vitest＋tsc 綠。用假資料渲染看一次桌面寬度。

檔案：`app/(shell)/ops/systems/**`。不碰 lib/systems、匯入器、migration。
