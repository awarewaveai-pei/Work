# 跨 AI 共享 MCP 與 API 標準作業程序

**SSOT 原則：** 任何修改僅限於 `mcp/` 目錄下的 template 檔案，嚴禁手動修改 `.mcp.json` 或使用者目錄下的 config。

## 新增步驟

### 1. 宣告金鑰 (Secrets Declaration)
- **修改檔案**：`mcp/user-env.template.ps1`
- **目的**：定義 SSOT 變數名稱，確保所有 AI 使用相同的環境變數 key。
- **範例**：`$env:NEW_SERVICE_API_KEY = "<PASTE_HERE>"`

### 2. 定義工具 (Server Definition)
- **修改檔案**：`mcp/registry.template.json`
- **目的**：新增 MCP Server 的啟動指令、參數與環境變數對應。
- **關鍵點**：
  - 環境變數引用格式：`"${env:NEW_SERVICE_API_KEY}"`
  - 工作目錄引用格式：`"${workspaceRoot}"`

### 3. 本地金鑰填寫 (Local Activation)
- **修改檔案**：`mcp/user-env.ps1` (此檔案已 gitignore)
- **動作**：填入實體 API Key 並執行此腳本。

### 4. 全域廣播 (Synchronize)
- **指令**：`npm run mcp:governance`
- **效用**：自動將變動分發至 Cursor, Codex, Copilot, Gemini 並更新 AI 啟動提示包。

### 5. 閘道驗證 (Validation)
- **指令**：`.\scripts\verify-build-gates.ps1`
- **目的**：確保同步狀態正確且無規則分歧。

## 嚴禁行為
1. **嚴禁** 在 `registry.template.json` 寫入任何明文 API Key。
2. **嚴禁** 手動修改 Repo 根目錄的 `.mcp.json`。
3. **嚴禁** 在其他目錄建立 `collaborator-ai-agent-rules.md` 的副本。
