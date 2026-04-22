# 協作 AI 代理規則（非 Cursor 收關者）

**適用**：Codex、Claude Code、其他 Cursor 視窗、外包助理用的 ChatGPT——凡**不是**當日指定之 **Cursor 收關（closer）** 者，皆遵守本檔。  
**收關者**：唯一有權在收工前**定稿** `WORKLOG.md`、`memory/CONVERSATION_MEMORY.md`、`memory/daily/*.md`，並在 monorepo 根執行 **`scripts/ao-close.ps1`** 的代理（見 **`.cursor/rules/40-shutdown-closeout.mdc`**）。

**正本路徑**：`agency-os/docs/operations/collaborator-ai-agent-rules.md`（可版控）。  
**本地收件匣**（不進 Git）：`agency-os/.agency-state/closeout-inbox.md`。

---

## 一鍵貼給其他 AI（系統提示或對話開頭）

將下方整段複製到該工具的使用者規則／專案說明／第一則訊息（並把 `<AGENT_ID>` 改成可辨識名稱，例如 `Codex-A`、`Claude-B`）：

```text
你是「協作代理」，不是「收關者」。

【禁止】
- 不要編輯或定稿以下檔案的「當日收工內容」：WORKLOG.md（當日 ## yyyy-MM-dd 區塊）、memory/CONVERSATION_MEMORY.md、memory/daily/ 下當日檔、TASKS.md 的勾選定稿（不要與收關搶寫 AUTO_TASK_DONE 定稿）。
- 不要執行 monorepo 根的 scripts/ao-close.ps1，也不要代替收關者 git push 到約定主線（除非使用者明文指定由你收關）。
- 不要在任何檔案或對話中寫入 token、私鑰、還原後的 MCP 備份內容。

【必做】
- 每完成一塊可驗收工作，在「monorepo 根」之下的檔案末尾追加一個區塊（UTF-8、Markdown）：
  agency-os/.agency-state/closeout-inbox.md
  若目錄或檔案不存在：先建立目錄 .agency-state，再建立檔案；或請使用者執行：powershell -ExecutionPolicy Bypass -File .\scripts\init-closeout-inbox.ps1
- 區塊標題格式：### <AGENT_ID> <ISO 本地時間>
- 區塊內必含：完成一句、動到的路徑或模組、若已 commit 則寫 hash；若對應 TASKS.md 某一條，貼該行「可唯一識別」的子字串（方便收關寫 AUTO_TASK_DONE）。
- 可正常改程式、開 branch、commit；與其他代理並行時優先不同 branch，降低同檔衝突。

完整說明見 repo：agency-os/docs/operations/collaborator-ai-agent-rules.md
```

---

## 角色與目標

| 項目 | 協作代理（你） | 收關者（Cursor） |
|:---|:---|:---|
| 寫 code、修 bug、開 PR | ✅ | ✅ |
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

- 並行時使用**不同 branch** 或清楚前綴的 commit message，便於收關 `merge`。
- **不要**在協作代理這邊對共享分支做 `push --force`，除非使用者明確書面授權。
- Commit message 建議含 `AGENT_ID` 與摘要，便於 `print-today-closeout-recap` 與日後查 log。

---

## 機密與合規

- 收件匣與對話中**不得**出現 API key、token、私鑰、客戶 PII；以「已設定環境變數名」或「見 vault／DPAPI 流程」代替。
- 不將 `.env`、憑證檔納入 commit；若不慎改動，立即告知使用者並依資安 runbook 處理。

---

## 與收關流程的銜接

1. 協作代理整日／整輪 **只 append** `closeout-inbox.md`。  
2. 收關前由使用者或代理把各 branch **合併**到當日工作線。  
3. **Cursor 收關**讀 inbox + `git log` + `scripts/print-today-closeout-recap.ps1`，寫定 WORKLOG／memory／daily，必要時寫 `AUTO_TASK_DONE`，再執行 `ao-close.ps1`（長訊息用 `-CommitMessageFile`）。  
4. **Push 成功後**收關者應**清空或刪除** `closeout-inbox.md`，避免隔天誤用。

更細收工步驟：**[end-of-day-checklist.md](end-of-day-checklist.md)** §0.5、§1a。

---

## 範本與初始化

- 可版控範本（複製到收件匣或給腳本 seed）：[closeout-inbox-TEMPLATE.md](closeout-inbox-TEMPLATE.md)  
- 本機建立空收件匣：`powershell -ExecutionPolicy Bypass -File .\scripts\init-closeout-inbox.ps1`（monorepo 根）
