# W6 /ops/systems 頁面照參考面板改版（Sonnet 5.5）

先讀 `COMMON.md`、PLAN §2／§3／§6；整份讀參考面板 `agency-os/handoffs/2026-11-21-systems-control-center/reference/ops-systems-prototype.html`（操作者給的版面原型，示範資料）；整份讀現有 `app/(shell)/ops/systems/{page.tsx,parts.tsx,[slug]/page.tsx,actions.ts}` 與 `lib/systems/{projection,store,labels}.ts`。外觀規則：`app/(shell)/tools/theme/THEME_ARCHITECTURE_APPEARANCE.md`。App 根 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

照原型做（資料全部來自既有投影，不新增 API、不改資料表）：
1. 頁首：標題＋一句說明。
2. 四張統計卡：系統總數／開發中／待確認（停滯或有缺口）／維護與已完成。
3. 左：「所有系統」表——名稱＋type＋階段數、狀態徽章、已驗收比例（verified ÷ 規劃功能；無功能顯示「尚未盤點」，不畫假進度條）、最近動態。搜尋框＋狀態篩選**用按鈕列，不用下拉**。手機寬度改卡片列表。
4. 右：「下次從這裡繼續」（最近 3 筆有效 handoff：系統、next、有無 blocker、連到詳情）；「資料同步狀態」（最後成功匯入時間、HEAD 前 9 碼、各缺口數）。
5. 詳情（沿用 `[slug]` 頁，不做抽屜）：用途、兩個數字「歷史標示完成」（migration 事件 legacy 為 done 的比例）與「有證據驗收」、階段（未切換的顯示舊監工頁連結）、功能清單、接續卡、**「複製接續摘要」按鈕**：把真實資料組成 Markdown（格式照 GPT 規格 7.2：專案簡介／已驗收／已實作待驗證／未完成與卡點／上次完成／下一步／來源），client component 只做 clipboard。
6. 不做：原型的「立即更新」「新增系統」（設計已排除：容器不能觸發主機；系統定義只來自 registry）、原型自己的側欄（後台已有殼）、任何 hex 色碼與原型的配色——一律用 globals 既有 class＋主題 token。

測試（只寫這些）：接續摘要 Markdown 組裝純函式（已驗收／待驗證分組、無 handoff 時的文字、跳脫）；統計卡計數純函式；既有授權測試保持綠。`npx tsc --noEmit` 綠。完成後用 `.claude/launch.json` 既有 next-admin 預覽或 `npm run dev` 實看桌面與手機寬度各一次（登入用本機 seed 測試帳號，不用正式帳號），截圖附回覆。

檔案：`app/(shell)/ops/systems/**`、`lib/systems/`（只加純函式檔與其測試，不改 store／contract／projection 的既有行為）。不碰 registry.json、匯入器、migration。
