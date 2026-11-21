# E4 會員票與 AI 每日上限

先讀：`COMMON.md`、`COMMON-WP.md`、`ORACLE-WP-SPEC.md` §2-7。專案 `Projects/internal/ziwei-doushu/`。模型 Opus 5.5（auth：完成後 `critic` Deep）。

## 目的
引擎不認得個人。WordPress 外掛替登入的會員簽一張短效票，框內頁呼叫 AI 解讀時帶上；引擎憑票把額度記在「站＋會員假名」上。沒有票＝匿名，行為與現在完全相同。

## 已知事實
- 站台簽章驗證已在 `lib/sites/verify.ts:41-73` `verifySiteRequest(rawBody, signature)`：Ed25519；`key_id`／`ts`（±60 秒）／`nonce`（一次）在 JSON 內；標頭 `X-AwareWave-Oracle-Signature`。登記表 `lib/sites/registry.ts`（`ORACLE_SITES`；`Site` 型別 `:19-27` 現有 `requestsPerMinute`）。
- `app/api/interpret/route.ts:104-106`：每來源每分鐘 `INTERPRET_RULE`（`lib/http/rateLimit.ts:23`，10 次）；`:19-20`、`:124-128` 註明每日計量待接。
- 限流工具 `lib/http/rateLimit.ts:37` `hit(scope, source, rule, now, weight)`：單一行程記憶體。

## 要做
1. 票（新 `lib/sites/ticket.ts`，純函式＋測試）：外掛簽的原文是 JSON `{"key_id","ts","nonce","member"}`；`member` 是 16–64 個 `[A-Za-z0-9_-]` 的假名；簽法與 `verify.ts` 相同。框內頁把原文（base64url）放標頭 `X-AwareWave-Oracle-Ticket`，簽章放 `X-AwareWave-Oracle-Signature`。驗證重用 `verifySiteRequest`（原文當 rawBody），不另寫一套；nonce 一次性照舊，所以一張票只能用一次。
2. `lib/sites/registry.ts`：每站加選填 `ai_per_day`（正整數，上限 100000；預設常數 `DEFAULT_AI_PER_DAY = 20`）＝每個會員假名每天可用的 AI 次數。
3. `app/api/interpret/route.ts`：
   - 沒有票標頭 → 現行流程，一行不變。
   - 有票：先做現行的來源限流 → 驗票失敗（任何原因）照 `verifySiteRequest` 的狀態碼回錯，不退回匿名 → 驗過後以 `<key_id>:<member>` 計每日用量（`hit` 視窗 24 小時，不新增儲存），超過 `ai_per_day` 回 429 帶 `Retry-After`。
   - 日誌與錯誤回應不含 facts，身分只出現假名。
4. `deploy/DEPLOY.md`：票的格式、標頭、錯誤碼、`ai_per_day`。

## 檔案
新：`lib/sites/ticket.ts`、`lib/sites/ticket.test.ts`。改：`lib/sites/registry.ts`（＋其測試）、`app/api/interpret/route.ts`（＋測試；沒有就新增一支只測票的路徑）、`deploy/DEPLOY.md`。不改 `lib/sites/verify.ts` 的行為（要改先回報）。

## 驗收
- 測試：無票 → 與現在相同（既有測試不變）；正確票 → 走到 AI 呼叫（用既有假 provider 或 mock）；錯簽、過期、重用同一張票、未知 `key_id`、`member` 格式錯 → 被拒；同一假名第 `ai_per_day`+1 次 → 429；不同假名各自計數。
- 突變一次：拿掉驗票那一行，「錯簽」測試變紅；還原變綠。
- `npx tsc --noEmit` exit 0；`npx vitest run lib/sites app/api/interpret` 綠。

## 邊界
不做外掛端；不加資料庫；不改匿名限流數字；不動 `app/api/v1/**`。
