# Closeout inbox（可版控）

**用途**：協作 AI 只對本檔 **append** 區塊；**`AO-CLOSE`** 執行 **`ao-close.ps1`** 時會由 **`merge-closeout-inbox-into-progress.ps1`** **verbatim** 併入當日 **`WORKLOG.md`**／**`memory/daily`** 並自本範本**重置**本檔（無須手動清空）。  
**實際路徑**（勿改檔名）：`agency-os/.agency-state/closeout-inbox.md`  
**說明**：本檔為範本；實際 `closeout-inbox.md` **已納入版控**，換機 `git pull` 即同步（收關後清空仍可避免殘稿堆疊）。

---

## 使用方式

1. 在 monorepo 根執行 `.\scripts\init-closeout-inbox.ps1` 可從本範本建立 `closeout-inbox.md`（若尚不存在）。  
2. 協作代理每完成一段工作，在檔案**末尾**追加一區：

```markdown
### <AGENT_ID> <yyyy-MM-dd HH:mm>

- **完成（一句）**:
- **變更路徑**:
  - ``
- **Git**:
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
```

3. 收關者勿長期保留已合併內容；push 後刪除或清空本檔。

---

（以下可刪除；為當日第一則範例占位）

### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:

### codex 2026-04-23 17:30

- **完成（一句）**: 新增本機 Perplexity / Grok CLI、xAI agent 模板，並整理一份給筆電 Codex 的 Grok 安裝提示文件
- **變更路徑**:
  - `scripts/perplexity-cli.ps1`
  - `bin/perplexity.cmd`
  - `bin/pplx.cmd`
  - `scripts/grok-cli.ps1`
  - `bin/grok.cmd`
  - `bin/xai.cmd`
  - `examples/xai-web-search-template.json`
  - `examples/xai-function-calling-template.json`
  - `GROK_LAPTOP_CODEX_INSTALL_PROMPT.md`
  - `agency-os/.agency-state/closeout-inbox.md`
- **Git**: 未 commit
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**: Perplexity API key 已確認回 `insufficient_quota`；Grok CLI 已用現有 `XAI_API_KEY` 實測成功，若新 shell 找不到 `grok` 需重開 PowerShell 或暫時補 `$env:Path += ";C:\Users\USER\Work\bin"`
