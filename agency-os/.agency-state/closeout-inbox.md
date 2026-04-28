# Closeout inbox（可版控）

**用途**：協作 AI 只寫入本檔 **`---` 以下**之 **`###` 區塊**；**`AO-CLOSE`** 執行 **`ao-close.ps1`** 時會由 **`merge-closeout-inbox-into-progress.ps1`** **verbatim** 併入當日 **`WORKLOG.md`**／**`memory/daily`** 並自本範本**重置**本檔（無須手動清空）。  
**實際路徑**（勿改檔名）：`agency-os/.agency-state/closeout-inbox.md`  
**說明**：本檔為範本；實際 `closeout-inbox.md` **已納入版控**，換機 `git pull` 即同步（收關後清空仍可避免殘稿堆疊）。

## 使用方式

1. 在 monorepo 根執行 `.\scripts\init-closeout-inbox.ps1` 可從本範本建立 `closeout-inbox.md`（若尚不存在）。  
2. **每一則可匯入區塊**使用一個 `###` 標題列。  
3. **插入位置（重要）**：在 **併入區**（檔案中**最後一條**單獨一行的 `---` 之後；範本只放一條，請勿再加第二條以免誤切）內，**把新區塊插在整段內容的最上方**（緊接該 `---` 的下一行開始寫），使 **日期／時間最新的一則永遠在最上面**；較舊的區塊留在下面。  
   - **不要**改寫已存在、較舊區塊的內文（除非修正錯字或補 hash）。  
   - 舊版「一律貼在檔案最末尾」已廢止。  
4. 收關者勿長期保留已合併內容；push 後收件匣會由腳本重置。

### 區塊範本（複製後改內容；新區塊請依上節置頂插入）

```markdown
### <AGENT_ID> <yyyy-MM-dd HH:mm>

- **完成（一句）**:
- **變更路徑**:
  - ``
- **Git**:
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
```

---

### claude-code 2026-04-28 00:00

- **完成（一句）**: 啟用 Gemini auto-classify（`OPS_INBOX_GEMINI_ENABLED=true` + `GEMINI_API_KEY`）、改善 prompt 格式、rebuild SG next-admin；新增 `ops-inbox-user-guide.md`，更新 README 與 incident-response-runbook 連結。
- **變更路徑**:
  - `agency-os/docs/operations/ops-inbox-user-guide.md`（新建）
  - `agency-os/docs/operations/README.md`（Ops Inbox 條目）
  - `agency-os/docs/operations/incident-response-runbook.md`（Related Documents）
  - SG `/root/lobster-phase1/.env`（`OPS_INBOX_GEMINI_ENABLED=true`、`GEMINI_API_KEY` 填入）
  - SG `/root/lobster-phase1/apps/next-admin/lib/ops-inbox/ai/gemini.ts`（prompt 結構化）
- **Git**: 未 commit（server 側在 repo 外；本地文件待 ao-close）
- **對應 TASKS 子字串（可選）**: Ops Inbox / Gemini auto-classify / ops-inbox-user-guide
- **風險／待辦（可選）**:
  - SG server `gemini.ts` prompt 改動未進 git；若重新部署需重改或從 server 拉回 `/app/ops/` 整包
  - EU server `.env` 未設 Gemini（ops inbox 只跑在 SG，無影響）

### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
