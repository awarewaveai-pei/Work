# GROK Laptop Codex Install Prompt

把下面整段貼給你筆電上的 Codex。這版不只裝 `grok` CLI，還會把 `grok-fast` / `grok-latest` 一起接進共享 MCP，讓 `Codex / Claude / Copilot / Gemini` 都能吃到。

```text
在這台 Windows 筆電上，幫我把 GROK CLI + 共用 MCP 一次裝好，做法和主機一致。請直接實作，不要只停在分析。除非真的卡住，否則請做到可驗證為止。

目標
- PowerShell 可直接用 `grok` 與 `xai`
- 共用 MCP registry 裡要有 `grok-fast`、`grok-latest`
- `Codex / Claude / Copilot / Gemini` 的 MCP 設定要能同步吃到 Grok
- xAI API key 走使用者環境變數 `XAI_API_KEY`
- 預設模型使用 `grok-4.20-reasoning`

你要檢查並處理的檔案 / 路徑
1. `C:\Users\USER\Work\scripts\grok-cli.ps1`
2. `C:\Users\USER\Work\bin\grok.cmd`
3. `C:\Users\USER\Work\bin\xai.cmd`
4. `C:\Users\USER\Work\examples\xai-web-search-template.json`
5. `C:\Users\USER\Work\examples\xai-function-calling-template.json`
6. `C:\Users\USER\Work\mcp\registry.template.json`
7. `C:\Users\USER\Work\mcp\user-env.ps1`
8. `C:\Users\USER\Work\scripts\sync-mcp-config.ps1`
9. `C:\Users\USER\.codex\config.toml`
10. `C:\Users\USER\.claude\mcp.json`
11. 如存在，也檢查：
- `C:\Users\USER\.copilot\mcp-config.json`
- `C:\Users\USER\.gemini\settings.json`

第一部分：安裝本機 GROK CLI
請建立：

- `C:\Users\USER\Work\scripts\grok-cli.ps1`
- `C:\Users\USER\Work\bin\grok.cmd`
- `C:\Users\USER\Work\bin\xai.cmd`

CLI 要支援：

- `grok help`
- `grok chat [options] <prompt>`
- `grok responses [options] <input>`
- `grok models`
- `grok get-response <response_id>`
- `grok delete-response <response_id>`
- `grok templates`
- `grok raw --method <GET|POST|DELETE> --path /v1/... [--body '{...}' | --body-file req.json]`

API 對應：
- `chat` → `POST https://api.x.ai/v1/chat/completions`
- `responses` → `POST https://api.x.ai/v1/responses`
- `models` → `GET https://api.x.ai/v1/models`
- `get-response` → `GET /v1/responses/{id}`
- `delete-response` → `DELETE /v1/responses/{id}`

參數需求：
- `chat` 支援 `--model --system --temperature --max-tokens --json`
- `responses` 支援 `--model --json --body-file --web-search --tool-choice`
- `templates` 要列出模板檔路徑
- `raw` 要能任意打官方 xAI endpoint

若缺 `XAI_API_KEY`，要報清楚錯誤。

第二部分：建立模板
請建立：

1. `C:\Users\USER\Work\examples\xai-web-search-template.json`
內容：Responses API + `web_search` 的最小可用範例

2. `C:\Users\USER\Work\examples\xai-function-calling-template.json`
內容：Responses API + custom function tool 的最小可用範例，例如 `get_temperature`

第三部分：接進共享 MCP
請檢查 `C:\Users\USER\Work\mcp\registry.template.json`，如果還沒有就加入這兩個 server：

- `grok-fast`
- `grok-latest`

要求：
- transport 用 `stdio`
- command 用 PowerShell 執行 `scripts/run-llm-mcp.ps1 -Provider xai`
- env 至少要有：
  - `XAI_API_KEY = ${env:XAI_API_KEY}`
  - `GROK_MODEL = "grok-4.20-reasoning"`

如果 registry 已經有這兩個，就不要破壞原本結構，只確認配置正確。

第四部分：確認 machine-local env source
請檢查 `C:\Users\USER\Work\mcp\user-env.ps1`
- 若沒有 `XAI_API_KEY` / `GROK_MODEL`，請補上：
  - `XAI_API_KEY = Resolve-Secret @("XAI_API_KEY")`
  - `GROK_MODEL = "grok-4.20-reasoning"`
- 若已有就不要亂改其他 secret

第五部分：同步到各客戶端
請執行共享同步流程：
- `C:\Users\USER\Work\scripts\sync-mcp-config.ps1`

目標是讓以下客戶端都拿到 Grok：
- Codex
- Claude
- Copilot
- Gemini

同步後請檢查：
- `C:\Users\USER\.codex\config.toml`
- `C:\Users\USER\.claude\mcp.json`
- 若存在也檢查：
  - `C:\Users\USER\.copilot\mcp-config.json`
  - `C:\Users\USER\.gemini\settings.json`

確認裡面有：
- `grok-fast`
- `grok-latest`

第六部分：PATH
請把：
- `C:\Users\USER\Work\bin`

加入使用者 PATH。
若已存在不要重複加。

第七部分：驗證
請直接執行並回報實際結果：

1. `grok help`
2. `grok templates`
3. 若 `XAI_API_KEY` 存在：
   - `grok chat "Reply with exactly: ready"`
4. 驗證 Codex config 或 Claude config 中確實已有：
   - `grok-fast`
   - `grok-latest`

如果 `grok` 指令在目前 shell 還不能直接用，請明確說明：
- 重開 PowerShell，或
- 先執行：
  `$env:Path += ";C:\Users\USER\Work\bin"`

實作要求
- 優先沿用 repo 既有模式，不要自創另一套架構
- 用 `apply_patch` 編輯檔案
- 不要洩漏額外無關 secret
- 最後列出你新增或修改的檔案
- 如果發現 registry / user-env / sync 已經完整，不要重複造輪子，直接補 CLI 與驗證即可
```
