# codex-oracle review -- 2026-11-29 02:28:34 +08:00

- mode: `review`
- scope: whole repo
- target: `working tree (staged + unstaged + untracked)`
- context: R3: logged-in members get their saved birth data prefilled in tool forms. lib/member/birthPrefill.ts reads window.parent.awOracleBirth() only from a same-origin parent (as memberRequest's ticket), retries once after 1.5s (parent script loads at page footer), times out at 3s, and validates the value with the engine's own BIRTH_FIELDS spec (parseInput + birthDateErrors) before use. components/BirthPrefill.tsx: once-only prefill, never after the user touched any field; notice + clear. Wired into BirthForm (ziwei, bazi, daily, hehun person A only), AstrologyTool natal form, VedicTool. PlaceField takes an optional initial place (remounted by key). Not a fix.
- exit: 0 | elapsed: 172904ms | answer: 1752B
- files-reviewed: Projects/internal/ziwei-doushu/components/AstrologyTool.tsx, Projects/internal/ziwei-doushu/components/BirthForm.tsx, Projects/internal/ziwei-doushu/components/HehunTool.tsx, Projects/internal/ziwei-doushu/components/PlaceField.tsx, Projects/internal/ziwei-doushu/components/VedicTool.tsx, Projects/internal/ziwei-doushu/messages/en.json, Projects/internal/ziwei-doushu/messages/zh-TW.json, Projects/internal/ziwei-doushu/components/BirthPrefill.tsx, Projects/internal/ziwei-doushu/lib/member/birthPrefill.test.ts, Projects/internal/ziwei-doushu/lib/member/birthPrefill.ts
- deletions-reviewed: (none)

> Codex output, NOT verified truth. R0 requires the caller to confirm every
> `file:line` before acting on it. Archived so that SKIPPING the oracle is
> visible -- not so that its findings are trusted.

---

FINDING 1: 正式的 WordPress 父頁沒有提供預填所需的函式
  file:line   -> Projects/internal/ziwei-doushu/lib/member/birthPrefill.ts:43
  confidence  -> CONFIRMED
  scenario    -> 登入會員開啟同源工具頁 → 程式尋找 `awOracleBirth`；父頁腳本只定義 `awOracleTicket`（lobster-factory/packages/oracle-wp-plugin/assets/embed-same-origin.js:33），重試後仍回傳 null，所有表單都不會預填。外掛目前版本也是 0.5.3（aware-wave-oracle.php:28）。
  why missed  -> 測試用假的父頁直接提供了 `awOracleBirth`，沒有驗證實際外掛。

FINDING 2: 在出生地搜尋框輸入文字不會阻止稍後的預填
  file:line   -> Projects/internal/ziwei-doushu/components/PlaceField.tsx:133
  confidence  -> CONFIRMED
  scenario    -> 父頁函式尚未載入時，使用者開始輸入城市名稱 → 搜尋框只呼叫 `setQuery`，沒有觸發 `markTouched`；預填到達後，`BirthForm.tsx:93` 更換 key、重掛出生地欄位，使用者已輸入的搜尋文字消失。
  why missed  -> 表單只把出生地的選定回呼視為「動過欄位」，漏掉搜尋輸入。

FINDING 3: 西洋占星會預填它無法計算的已儲存年份
  file:line   -> Projects/internal/ziwei-doushu/components/AstrologyTool.tsx:52
  confidence  -> CONFIRMED
  scenario    -> 會員儲存 1890 年出生資料（外掛允許 1800–2200，Record.php:19–20）→ 共用 `BIRTH_FIELDS` 驗證通過並顯示已預填；按送出後，占星 API 使用的年份範圍僅 1900–2099（fields.ts:104–106），回傳 400（app/api/astrology/route.ts:28）。
  why missed  -> 預填驗證沿用跨工具的出生資料規格，沒有核對西洋占星自己的年份限制。

TOTAL: 3 findings