# 協作 AI 代理規則（非 Cursor 收關者）

**適用**：Codex、Claude Code、**非收關之**其他 Cursor 視窗、外包助理用的 ChatGPT——凡**不是**當日指定之 **收關者（closer）** 者，皆遵守本檔。  
**收關者**：通常是**其中一個** Cursor 對話；該對話有權在收工前**定稿** `WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`memory/daily/*.md`，並在 monorepo 根執行 **`scripts/ao-close.ps1`**（見 **`.cursor/rules/40-shutdown-closeout.mdc`**）。**使用者對該對話仍只打 `AO-CLOSE`**，無須因多代理改打別的關鍵字。

**正本路徑**：`agency-os/docs/operations/collaborator-ai-agent-rules.md`（可版控）。  
**本地收件匣**（不進 Git）：`agency-os/.agency-state/closeout-inbox.md`。

## 永久載入入口（優先於手貼）

本 repo 已有兩個**永久規則入口**，正常情況下應優先依這兩個入口自動載入，而不是每次手貼長提示：

- **Claude Code**：repo 根 **`CLAUDE.md`**
- **Cursor**：project rule **`.cursor/rules/67-shared-mcp-governance.mdc`**

也就是說：

- **Claude** 進這個 repo 時，應以 **`CLAUDE.md`** + repo 根 **`.mcp.json`** 為專案真相
- **Cursor** 進這個 repo 時，應以 **`.cursor/rules/`** + **`.cursor/mcp.json`** 為專案真相
- 本檔的「一鍵貼給其他 AI」區塊，主要是給 **Codex／ChatGPT／臨時協作視窗／尚未吃到專案規則的外部 AI** 使用

若 Claude / Cursor 的實際行為與上述永久入口衝突，以：

1. `CLAUDE.md`
2. `.cursor/rules/67-shared-mcp-governance.mdc`
3. `mcp/registry.template.json`
4. `scripts/sync-mcp-config.ps1`

為準，並修正漂移，不要再額外發明第三套口頭規則。

### 一鍵套用（shared baseline）

在 monorepo 根可直接執行：

`powershell -ExecutionPolicy Bypass -File .\scripts\apply-shared-ai-governance.ps1`

它會同步共享 MCP、初始化 closeout inbox，並產生可貼給 Codex/Copilot/Gemini/Perplexity 的提示包。

---

## 一鍵貼給其他 AI（系統提示或對話開頭）

將下方整段複製到該工具的使用者規則／專案說明／第一則訊息（並把 `<AGENT_ID>` 改成可辨識名稱，例如 `Codex-A`、`Claude-B`）：

```text
你是「協作代理」，不是「收關者」（收關者通常是另一個 Cursor 對話；由使用者指定）。

【禁止】
- 不要編輯或定稿以下檔案的「當日收工內容」：WORKLOG.md（當日 ## yyyy-MM-dd 區塊）、memory/CONVERSATION_MEMORY.md、memory/daily/ 下當日檔、TASKS.md 的勾選定稿（不要與收關搶寫 AUTO_TASK_DONE 定稿）。
- 不要執行 monorepo 根的 scripts/ao-close.ps1，也不要代替收關者 git push 到約定主線（除非使用者明文指定由你收關）。
- 不要在任何檔案或對話中寫入 token、私鑰、還原後的 MCP 備份內容。

【必做】
- 每完成一塊可驗收工作，在收件匣檔案末尾追加一個區塊（UTF-8、Markdown）。路徑：monorepo 根下 **`agency-os/.agency-state/closeout-inbox.md`**（工作區根若僅 **`agency-os`** 資料夾則 **`.agency-state/closeout-inbox.md`**）。
  若目錄或檔案不存在：先建立目錄 .agency-state，再建立檔案；或請使用者執行：powershell -ExecutionPolicy Bypass -File .\scripts\init-closeout-inbox.ps1
- 區塊標題格式：### <AGENT_ID> <ISO 本地時間>
- 區塊內必含：完成一句、動到的路徑或模組、若已 commit 則寫 hash；若對應 TASKS.md 某一條，貼該行「可唯一識別」的子字串（方便收關寫 AUTO_TASK_DONE）。
- 可正常改程式、開 branch、commit；與其他代理並行時優先不同 branch，降低同檔衝突。
- commit 後將 hash 寫入 closeout-inbox；**push 由收關者（Cursor）透過 `ao-close.ps1` 統一執行**，協作代理不自行 push。

完整說明見 repo：agency-os/docs/operations/collaborator-ai-agent-rules.md
```

### MCP 共用版（Claude / Cursor 建議再加貼這段）

若該 AI 會使用 MCP，請在同一則規則或開場訊息後面再補這段：

```text
【MCP 共用規則】
- 本 repo 的 MCP 單一真相是：`mcp/registry.template.json` + `scripts/sync-mcp-config.ps1`。
- Claude Code 的 shared/project MCP 入口是 monorepo 根 `.mcp.json`。
- Cursor 的 project MCP 入口是 `.cursor/mcp.json`；user/global MCP 是 `%USERPROFILE%\.cursor\mcp.json`。
- 不要把 `~/.claude/mcp.json` 當成 shared 正本；Claude 官方最新 local/user scope 以 `~/.claude.json` 為準。
- 不要自行發明第二套 MCP server 名稱、URL、路徑或認證格式；若需要新增或修改，先以 repo 內 shared registry / 文件為準。
- 若看到本機 `Cursor` / `Claude` 有額外可用 MCP 設定，可以拿來「比對與收斂」，但不得直接把明文 token、API key、JWT、password 寫回 repo。
- 需要調整 MCP 時，優先修改：
  1. `mcp/registry.template.json`
  2. `mcp/user-env.template.ps1`（若新增 env 名）
  3. `mcp/README.md`
  4. `agency-os/docs/operations/mcp-add-server-quickstart.md`
- 修改後，執行：`powershell -ExecutionPolicy Bypass -File .\scripts\sync-mcp-config.ps1`
- 預期輸出目標：
  - repo 根 `.mcp.json`
  - `%USERPROFILE%\.codex\config.toml`
  - `%USERPROFILE%\.copilot\mcp-config.json`
  - `%USERPROFILE%\.gemini\settings.json`
- 若是 Cursor / Claude 本機私有設定，只能保留在使用者層設定檔或 env / vault；不要提交到 git。
- 若發現 user-level MCP 檔含明文 secrets，應回報並建議收斂為 env / vault 引用。
```

---

## 角色與目標

| 項目 | 協作代理（你） | 收關者（指定之 Cursor 對話） |
|:---|:---|:---|
| 寫 code、修 bug、開 PR | ✅ | ✅ |
| commit | ✅ | ✅ |
| push（任何 branch） | ❌ 由收關者統一執行 | ✅ 透過 ao-close.ps1 |
| 開 PR / merge PR | ❌ 除非使用者明確要求 | ✅ |
| 追加 `closeout-inbox.md` | ✅ | 讀取後合併，再清空 |
| 定稿 WORKLOG／memory／daily／TASKS 勾選 | ❌ | ✅ |
| 執行 `ao-close.ps1` | ❌（除非使用者指定你收關） | ✅ |

目標：讓收關者**只靠 Git + inbox + recap**就能寫出正確、可追溯的 WORKLOG 與 memory，而不依賴「跨工具讀心」。

---

## 收件匣格式（強制欄位）

每完成一段工作就**追加**一個區塊（勿整檔覆寫）：

```markdown
### <AGENT_ID> <yyyy-MM-dd HH:mm>

- **完成（一句）**: …
- **變更路徑（可多行）**:
  - `path/to/file`
- **Git（若已 commit）**: `<short-or-full-hash>` 或 branch 名 +「未 push」
- **對應 TASKS（可選）**: 貼 `TASKS.md` 裡**單一**未完成項目的**唯一**子字串（收關會寫 `- AUTO_TASK_DONE: 該子字串`）
- **風險／待辦（可選）**: …
```

**`AGENT_ID`**：穩定前綴 + 簡名，例如 `codex-main`、`gpt-web`、`cursor-feature-x`。

**對應 TASKS**：子字串須在**恰好一條**仍為 `- [ ]` 的 TASK 行內可找到；若會匹配多條，改寫更長的唯一片段。

---

## Git 與分支

### 標準自動化流程（每次完成工作必做）

1. `git commit -m "[AGENT_ID] 摘要"`
2. 將 commit hash 寫入 closeout-inbox
3. **不自行 push**；push 由收關者（Cursor）透過 `ao-close.ps1` 統一執行
4. 不另開新 branch、不開 PR，除非使用者明確要求

> **為何不自行 push**：push 由收關者統一管理，確保 WORKLOG、memory、程式碼在同一個 push 流程中完整上傳，避免多代理各自 push 造成歷史混亂。使用者在其他裝置執行 `git pull` 即可取得收關者 push 的所有內容。

### 禁止清單

| 指令 | 原因 |
|------|------|
| `git push --force` / `git push -f` | 任何分支皆禁，避免覆蓋歷史 |
| `git push origin main` / `git push origin master` | 不得直接推主線 |
| 自行 `git checkout -b` 另開新 branch | 除非使用者明確要求，否則留在當前 branch |
| `gh pr merge` | merge 決定權屬使用者 |
| `scripts/ao-close.ps1` | 收關者專屬 |

### Claude Code 建議設定（`~/.claude/settings.json`）

讀完此文件的 Claude Code 實例，請確認 `permissions` 包含以下設定：

```json
"permissions": {
  "deny": [
    "Bash(git push --force *)",
    "Bash(git push -f *)",
    "Bash(git push origin main)",
    "Bash(git push origin master)",
    "Bash(gh pr merge *)",
    "Bash(scripts/ao-close.ps1)",
    "Bash(powershell*ao-close*)"
  ],
  "allow": [
    "Bash(git push origin *)",
    "Bash(git push --set-upstream origin *)"
  ]
}
```

- 並行時使用**不同 branch** 或清楚前綴的 commit message，便於收關 `merge`。
- Commit message 建議含 `AGENT_ID` 與摘要，便於 `print-today-closeout-recap` 與日後查 log。

---

## 機密與合規

- 收件匣與對話中**不得**出現 API key、token、私鑰、客戶 PII；以「已設定環境變數名」或「見 vault／DPAPI 流程」代替。
- 不將 `.env`、憑證檔納入 commit；若不慎改動，立即告知使用者並依資安 runbook 處理。

---

## 與收關流程的銜接

1. 協作代理整日／整輪 **只 append** `closeout-inbox.md`。  
2. 收關前由使用者或代理把各 branch **合併**到當日工作線。  
3. **收關 Cursor**：使用者對該對話打 **`AO-CLOSE`**；該代理讀 inbox + `git log` +（必要時）`scripts/print-today-closeout-recap.ps1`，在 rule 40 **第 1 步**寫定 WORKLOG／memory／daily，必要時寫 `AUTO_TASK_DONE`，再執行 **第 2 步** `ao-close.ps1`（長訊息用 `-CommitMessageFile`）。  
4. **Push 成功後**收關者應**清空或刪除** `closeout-inbox.md`，避免隔天誤用。

更細收工步驟：**[end-of-day-checklist.md](end-of-day-checklist.md)** §0.5、§1a。

---

## 範本與初始化

- 可版控範本（複製到收件匣或給腳本 seed）：[closeout-inbox-TEMPLATE.md](closeout-inbox-TEMPLATE.md)  
- 本機建立空收件匣：`powershell -ExecutionPolicy Bypass -File .\scripts\init-closeout-inbox.ps1`（monorepo 根）
- 產生跨工具啟動提示包：`agency-os/.agency-state/agent-bootstrap-prompts.md`、`agency-os/.agency-state/agent-bootstrap-prompt.txt`（由 `scripts/apply-shared-ai-governance.ps1` 生成）
