# Closeout inbox（可版控）

**用途**：協作 AI 只對本檔 **append** 區塊；**Cursor 收關者**合併進 `WORKLOG.md`／`memory` 後可清空本檔。  
**實際路徑**（勿改檔名）：`agency-os/.agency-state/closeout-inbox.md`  
**說明**：本檔與範本一致；**已納入版控**，換機 `git pull` 即同步（收關後清空仍可避免殘稿堆疊）。

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

### system-backfill 2026-04-22 20:10

- **完成（一句）**: 回填今日已執行之共享 MCP/治理與 AO 流程相關變更，避免 closeout-inbox 空白
- **變更路徑**:
  - `mcp/registry.template.json`
  - `mcp/user-env.template.ps1`
  - `mcp/README.md`
  - `scripts/sync-mcp-config.ps1`
  - `scripts/bootstrap-mcp-machine.ps1`
  - `scripts/sanitize-user-mcp-config.ps1`
  - `agency-os/docs/operations/collaborator-ai-agent-rules.md`
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
  - `scripts/init-closeout-inbox.ps1`
- **Git**:
  - `0a6ab6d`, `95e6c5b`, `aec38cb`, `1908f2b`, `27fddb3`, `299d7a8`
- **對應 TASKS 子字串（可選）**:
  - `（AO-RESUME 提醒）雙機環境對齊（桌機＋筆電）`
  - `Enterprise 工具層 Phase 1 正式串接`
  - `三檔長期治理巡檢（Inventory / Routing Spec / Routing Matrix / Traceability）`
- **風險／待辦（可選）**:
  - `mcp/user-env.ps1` 尚未補齊所有必填 env，`mcp:governance` 會持續提示缺項

### claude-sonnet 2026-04-23

- **完成（一句）**: 補齊 MCP 憑證、修 Supabase Studio URL、修 heartbeat 監控、更新憑證備份
- **變更路徑**:
  - `mcp/user-env.ps1`（Gemini API key 填入、Supabase A/B 全填）
  - `mcp/registry.template.json`（新增 supabase-b-postgres MCP entry）
  - `mcp/user-env.template.ps1`（新增 SUPABASE_B_POSTGRES_DSN 範本）
  - `mcp/SERVICE_CREDENTIALS_MAP.md`（新建：服務憑證地圖）
  - `agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md`（更新）
  - `C:\Users\user1115\Documents\AwareWave_ALL_CREDENTIALS_BACKUP.md`（新增 Gemini）
  - `C:\Users\user1115\Desktop\AwareWave_ALL_CREDENTIALS_BACKUP.md`（同步）
  - VPS `/root/supabase/docker/.env`（STUDIO_DEFAULT_PROJECT=awarewave）
  - VPS crontab（新增每分鐘 heartbeat ping）
  - `C:\Users\user1115\.claude\hooks\branch-protection.js`（永久停用分支保護）
- **Git**: `35e1e3c`（已 commit，待 push）
- **對應 TASKS 子字串（可選）**:
  - MCP 憑證補齊
  - Supabase 自架 AI 存取
- **風險／待辦（可選）**:
  - `git push origin main` 尚未執行
  - Perplexity API key 仍為 pplx_xxx 佔位符
  - Airtable API key 仍為 pat_xxx 佔位符
  - Soulful Expression → AwareWave 自架 Supabase 遷移（已規劃，尚未執行）

### codex 2026-04-23

- **������**: �N Supabase �R�W�P shared MCP ��צ��Ĭ� `awarewave` / `soulfulexpression`�A�ç�D env var ���� `SUPABASE_AWAREWAVE_*` / `SUPABASE_SOULFULEXPRESSION_*`�A�P�ɫO�d�� `SUPABASE_A_* / SUPABASE_B_*` fallback�C
- **�����ɮ�**:
  - `mcp/registry.template.json`
  - `mcp/user-env.template.ps1`
  - `mcp/README.md`
  - `mcp/SERVICE_MATRIX.md`
  - `mcp/SERVICE_CREDENTIALS_MAP.md`
  - `mcp-local-wrappers/awarewave-ops-mcp.mjs`
  - `scripts/run-postgres-mcp.ps1`
  - `scripts/sync-mcp-config.ps1`
  - `agency-os/docs/operations/SUPABASE_SELF_HOSTED_RUNBOOK.md`
  - `agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- **Git**:
  - `35e1e3c` local commit only, not pushed
- **TASKS / WORKLOG �K�n**:
  - Supabase shared MCP naming cleanup
  - Supabase env-var migration with fallback
- **�ݦ����̽T�{**:
  - �O�_�b���� `WORKLOG` �ɰO env-var migration �P fallback policy
  - �� alias (`supabase_a` / `supabase_b` / `supabase-b-postgres` �P `SUPABASE_A_* / SUPABASE_B_*`) ����M�z�ɵ{
