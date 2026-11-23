# E6 引擎：框內頁取會員票；每日運勢英文

先讀：`COMMON.md`、`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §2-7。專案 `Projects/internal/ziwei-doushu/`。只讀：`lobster-factory/packages/oracle-wp-plugin/assets/embed-same-origin.js:10-45`（父頁提供的 `window.awOracleTicket()`）、`lib/sites/ticket.ts`、`app/api/interpret/route.ts`。模型 Opus 5.5（auth：完成後 `critic` Deep）。

## 1. 框內頁向父頁取票
- 事實：外掛（P3，main `94e7b066a`）在同網域父頁定義 `window.awOracleTicket()`，回傳 Promise<`{ ticket, signature }` | null>；只對登入訪客定義。引擎 `/api/interpret` 已會驗 `X-AwareWave-Oracle-Ticket`／`X-AwareWave-Oracle-Signature`（E4）。但引擎的 AI 解讀元件（`components/AiReading.tsx`）還沒有去拿票，所以會員的每日 AI 額度不會生效。
- 做：`AiReading.tsx` 送出前，若頁面在同源的框內且 `window.parent.awOracleTicket` 是函式，就呼叫它；拿到票才帶兩個標頭，拿不到（null、逾時、丟錯、跨源存取被擋）就照現在的匿名方式送，不擋使用者。取票設逾時（例如 3 秒）。票只放標頭，不放網址、不存任何儲存。
- 守住：只認 `window.parent`（同源）；不對任意 `postMessage` 來源取票；獨立版頁面（不在框內）行為與現在逐位元組相同。
- CSP：E2 的政策 `connect-src 'self'` 已涵蓋；不放寬。
- 帶了票卻被引擎拒絕（401／429）時的顯示：429 `daily_limit_reached` 顯示「今天的次數用完了」與可再試的時間；401 不退回匿名重送（E4 的規矩：驗票失敗不降級）。

## 2. 每日運勢的英文
- 事實：`lib/daily.ts:216` 附近的「宜／忌」內容只有中文，英文信與英文頁會出現中文（P3 回報）。
- 做：照專案既有的雙語做法（`lib/i18n/` 與各工具的字典）補英文；資料結構若是清單就整份補齊，鍵型別讓漏翻譯時 tsc 紅。`/api/v1` 與 `/api/v1/batch` 帶 `locale=en` 時回英文。繁中輸出不變（既有測試不改）。

## 驗收
- 測試：有 `window.parent.awOracleTicket` → 請求帶兩個標頭；回 null、丟錯、逾時 → 不帶標頭照常送；不在框內 → 不呼叫；429 的顯示。每日運勢英文：一組固定日期的輸出不含任何中日韓字元；繁中輸出與改前相同。
- 突變一次：把「401 不重送」改成退回匿名重送 → 指名測試變紅 → 還原變綠。
- 預覽實看：用一個本機 HTML 當父頁（同源，定義假的 `awOracleTicket`）框住 `/embed/zh-TW/ziwei`，按 AI 解讀，網路請求帶有兩個標頭。
- `npx tsc --noEmit`；`npx vitest run <受影響路徑>`；`critic` Deep。

## 邊界
不改外掛；不改 `/api/interpret` 的驗票邏輯；不做付費深度報告（規格 §8）。不 push、不部署。
