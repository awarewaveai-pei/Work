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

### claude 2026-04-28 02:10

- **完成（一句）**: Ops Inbox Path B 端到端測試全通 + 修復兩個 bug（health route 服務端程式碼過舊、test script RUN_ID JSON 無效）
- **變更路徑**:
  - `lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.sh`（monitor.id 加引號）
  - `lobster-factory/infra/hetzner-phase1-core/scripts/test-ops-inbox-webhooks.ps1`（移除 [int] 強制轉型）
  - `/root/lobster-phase1/apps/next-admin/app/api/ops/inbox/health/route.ts`（伺服器直接改為 getSupabaseServerClient，rebuild）
  - `/root/lobster-phase1/.env`（設定 OPS_INBOX_INGEST_TOKEN、OPS_INBOX_NOTIFY_ENABLED=true、OPS_INBOX_SLACK_INCIDENTS_WEBHOOK）
- **Git**: da3db86
- **對應 TASKS 子字串（可選）**: ops-inbox, Path B, webhook test
- **風險／待辦（可選）**: 伺服器 /root/lobster-phase1/ 原始碼與 repo 有落差（至少 health route），建議下次 git pull 補齊；Slack 通知需確認實際頻道是否收到訊息

### claude 2026-04-27 23:59

- **完成（一句）**: Cloudflare SSL → Full Strict、SG/EU reverse proxy 全驗證、所有 admin 工具登入保護確認、AWARE_WAVE_CREDENTIALS.md 最新版對照完成
- **變更路徑**:
  - `~/.claude/projects/d--Work/memory/reference_cloudflare.md`（更新 MCP Token、WAF wp-login 狀態、SSL=Strict）
- **Git**: 未 commit（本 session 僅更新 memory；repo 本體無程式碼變更）
- **對應 TASKS 子字串（可選）**: Cloudflare SSL Full Strict, proxy verification, admin login protection
- **風險／待辦（可選）**: Slack #infra-alerts 批次刪除已取消（不再需要）

### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
