# W7 /ops/systems 補齊參考面板＋資料空時不顯得壞掉（Sonnet 5.5）

先讀 `COMMON.md`、`reference/ops-systems-prototype.html`（整份）、現有 `app/(shell)/ops/systems/{page.tsx,[slug]/page.tsx,CopyBrief.tsx}`、`lib/systems/{overview,projection,labels}.ts`。App 根 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

操作者看正式頁說「少很多東西」。正式庫現況：29 系統、4537 activity、51 migration、0 handoff、3 status_change → 多數系統狀態「未設定」、接續空、已驗收 0%。

做：
1. 補回原型元素：標題上方英文小標（DEVELOPMENT COMMAND CENTER）、四張統計卡右上的圖示、「所有系統」右上的「即時篩選」小標、整列可點（不只名稱）、右下「不記得上次做到哪裡？」說明卡（按鈕連到最近一筆有接續的系統詳情；沒有就連第一個系統）。
2. 狀態推定（純函式，放 `lib/systems/overview.ts`）：系統沒有任何 `status_change` 時，依 `lastActivityAt` 推定——14 天內有 commit＝開發中、15–60 天＝維護中、超過 60 天＝暫停；徽章文字加「（推定）」，統計卡用推定值。有 `status_change` 就用它。
3. 進度欄：除了「已驗收 x%」，同格顯示「已實作 y%」（implemented 以上 ÷ 規劃功能），進度條畫已實作、已驗收用較深色疊上；文字色只用 `--accent-text`，底色才用 `--accent`。
4. 詳情頁同樣顯示推定狀態與已實作比例。
5. 仍不做：「立即更新」「新增系統」（設計已排除）；不用下拉；零 hex。

測試（只寫這些）：狀態推定三段與「有 status_change 優先」；已實作比例。跑 next-admin **全套** `npx vitest run` 與 `npx tsc --noEmit`，都要綠。

檔案：`app/(shell)/ops/systems/**`、`lib/systems/overview.ts`＋其測試、`lib/systems/labels.ts`（只加標籤）。不碰 store／contract／projection 既有行為、registry、匯入器。
