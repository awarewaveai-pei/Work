# X2 MCP 端點——X1 併入後才做

目的：讓 AI 助理（Claude、ChatGPT 等）能把本站的排盤當工具呼叫。參考（只看做法）：`fzlzjerry_tarot-mcp\src\mcp\tool-definitions.ts`、`public-api.ts:28-45`（16 個工具與標註）、`cantian-ai_bazi-mcp\src\mcp.ts`（三個工具，含八字反推日期）、`x-haose_x-iztro\src\text.rs`（給 LLM 的文字輸出格式）、Kerykeion `kerykeion\context\`（給 LLM 的結構化文字）。細節：`research-detail/tarot-mcp.md` §4-5、`x-iztro.md` §5、`kerykeion-core.md` §6。
前提：X1 已有 `DivinationSystem` 輸入規格、`parseInput`、限流模組。

做：
1. `app/api/mcp/route.ts`：MCP Streamable HTTP，無狀態。工具清單由登錄表自動產生：每個系統一個工具（名稱、說明、輸入 JSON Schema 都由 X1 的輸入規格轉出），外加 `list_systems`。註冊新系統不需改這個檔。
2. 回傳：`content` 一段給模型讀的純文字（由 `context.facts` 排成，自己寫一個 `factsToText`，繁中或英文依 `locale`）＋ `structuredContent`（`{ data, context }`）。工具標註唯讀、無副作用。
3. 協定實作：優先用官方 `@modelcontextprotocol/sdk`（MIT），先讀它的文件確認在 Next 16 route handler 可用；若傳輸層不合，照規格手寫最小集合（`initialize`、`ping`、`tools/list`、`tools/call`），在檔頭寫明支援範圍與協定版本。二擇一並在回報說明理由。
4. 八字反推出生日期（給四柱，列出可能的國曆時間；`lunar-javascript` 的 `Solar.fromBaZi`）：若能照 `DivinationSystem` 合約乾淨地註冊成一個系統就加（REST 與 MCP 自動都有），不能就列 RISKS，不要為它另開一條路。
5. 安全：沿用 X1 限流；請求本文大小上限；不開 AI 解讀；不存任何使用者輸入；不回傳堆疊。`Origin` 檢查依 MCP 規格對 Streamable HTTP 的要求處理。
6. 測試：`tools/list` 的工具數＝登錄表系統數＋1；每個工具用範例輸入呼叫一次成功；錯誤輸入回 MCP 的錯誤格式；`factsToText` 一個快照。
7. 文件：`deploy/DEPLOY.md` 加端點網址與連線方式一小節；部署煙霧測試加一條 `initialize`。

檔案：`app/api/mcp/route.ts`（新）、新 `lib/mcp/*.ts`、`package.json`（若採 SDK）、`deploy/DEPLOY.md`、infra 煙霧測試兩檔、測試。
