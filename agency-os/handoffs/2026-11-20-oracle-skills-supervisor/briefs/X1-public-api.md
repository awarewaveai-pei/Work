# X1 對外資料介面（REST v1）——批 6 全部併入後才做

目的：把站上的確定性引擎開成對外可呼叫的資料介面。參考設計（只看做法）：`cantian-ai_bazi-mcp\src\mcp.ts`、`src\index.ts`（輸入欄位與 JSON 輸出）、`fzlzjerry_tarot-mcp\src\mcp\http-server.ts`（限流、CORS、已知弱點見 `research-detail/tarot-mcp.md`）。
現況：`lib/divination/types.ts`（`DivinationSystem.compute(input, locale) → {data, context}`）、`lib/divination/registry.ts`、`lib/divination/index.ts`（占星未註冊，註解寫著待辦）、`app/api/astrology/route.ts`（手寫驗證）、`app/api/interpret/route.ts`（AI，花錢，無限流）。全站目前沒有任何限流。

不變量：**註冊一個系統 = 自動得到驗證、REST、文件（之後還有 MCP）**。輸入規格只寫一次。

做：
1. 輸入規格單一來源：`DivinationSystem` 加一個宣告式的輸入規格（欄位、型別、範圍或列舉、必填、繁中與英文說明）；一個通用 `parseInput(spec, body)` 做驗證並回傳型別化輸入或錯誤清單。九個既有系統全部補上。不新增驗證用的 npm 依賴。函式型欄位（如 `rng`）不對外；抽選類系統由伺服器用密碼學亂數，另允許呼叫端自帶結果（如易經六個爻值、籤號）以便重現。
2. 占星與每日運勢註冊為系統（`SYSTEM_IDS` 已有 `astrology`；每日運勢與 D1 的當日黃曆照同一合約）。`app/api/astrology/route.ts` 的手寫驗證刪掉，改走同一套規格；`AstrologyTool` 改呼叫新端點或該路由變成薄轉接——二擇一，不留兩份驗證。
3. 端點（`app/api/v1/`）：`GET /api/v1/systems`（系統清單＋各自輸入規格＋`apiVersion`）；`POST /api/v1/systems/{id}`，body `{ input, locale? }` → `{ apiVersion, system, data, context }`。`data` 必須是純 JSON（紫微的 astrolabe 用它自己的 `toJSON()`）。錯誤格式統一 `{ error, detail }`，400／404／429／500 分清楚，例外不外洩堆疊。
4. 不對外開 AI 解讀；v1 只給確定性結果。
   伺服器沒有「使用者的今天」：凡是用到今天的系統（易經六爻的起卦日、每日運勢與黃曆、塔羅每日一牌、占星小限與行運、風水流年、八字流年）對外介面一律由呼叫端傳日期，規格標必填；不可在伺服器端用 `localToday()` 當預設。
5. 限流：一個共用小模組（每來源位址固定視窗，記憶體計數，回 429＋`Retry-After`），套在 v1、`/api/astrology`（若保留）與 `/api/interpret`。來源位址取法先讀 `lobster-factory/infra/hetzner-phase1-core/` 的 nginx 設定確認轉送的是哪個標頭，只信那一個；寫明多副本時計數不共享的限制。
   wasm 追蹤：`next.config.ts` `outputFileTracingIncludes` 目前每條用到 `@xalen/wasm` 的路由各列一行（漏列＝正式環境 500）。新路由一併改成一個涵蓋所有會載入 wasm 的路由的寫法，並用 `next build` 後檢查 `.nft.json` 驗證。
6. CORS：只對 `/api/v1/*` 開放任意來源的 GET／POST／OPTIONS，不帶憑證。
7. 部署煙霧測試加一條 `/api/v1/systems`（`lobster-factory/infra/hetzner-phase1-core/scripts/sg-deploy.sh` oracle-web 那段，照既有寫法加一行）與對應的 `tests/host-scripts` 測試。
8. 測試：`parseInput` 的必填、範圍、列舉、多餘欄位；每個系統用規格裡的範例輸入呼叫一次 handler 得 200 且 `data` 可 `JSON.stringify`；限流第 N+1 次回 429；未知系統 404。
9. 文件：`Projects/internal/ziwei-doushu/deploy/DEPLOY.md` 加一小節（端點、限流數值、無帳號無計量；日後要收費時走 `can()`，與 oracle 的帳號卡一起做）。

檔案：`lib/divination/types.ts`、`lib/divination/systems/*.ts`、新 `lib/divination/input.ts`、新 `lib/http/rateLimit.ts`、`app/api/v1/**`、`app/api/astrology/route.ts`、`app/api/interpret/route.ts`（只加限流）、`components/AstrologyTool.tsx`、上述 infra 兩檔、`deploy/DEPLOY.md`、測試。
