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

**欄位約束（與 `collaborator-ai-agent-rules.md` 一致）**

- **僅**上述六個頂層欄位（標題字串須與範本一致）。**禁止**新增第七類頂層項目（例如 `- **伺服器操作（無 commit）**`）；`merge-closeout-inbox-into-progress.ps1` 雖以區塊 verbatim 合併、不逐欄解析，但若混入未約定欄位會造成 **AUTO_TASK_DONE**／人工對照 **TASKS** 時格式漂移。
- **無 git commit 的遠端／伺服器操作**：請寫入 **風險／待辦（可選）**（建議首行括註「遠端／無 commit」），或併入 **變更路徑**／**完成（一句）** 之敘述，勿另立欄位。
- **對應 TASKS 子字串（可選）**：僅填 **一行**，且為 `TASKS.md` 裡**恰好一條**仍為 `- [ ]` 之項目上的**唯一可識別子字串**；**勿**以逗號並列多項、勿對應多條待辦（多項進度請拆成多個 `###` 區塊或只選主線一條）。

---

### claude-sonnet-4-6 2026-05-06 18:30

- **完成（一句）**: Build Console 前置帳號區段 + integrations 預設展開 + 部署至伺服器 + deploy.sh --no-deps 修正
- **變更路徑**:
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/build/BuildConsole.tsx`
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/globals.css`
  - `lobster-factory/infra/hetzner-phase1-core/deploy.sh`
  - `lobster-factory/packages/workflows/src/integrations/integration-steps.ts`（新）
  - `lobster-factory/packages/workflows/src/trigger/adopt-client-os.ts`（新）
  - `lobster-factory/packages/workflows/src/trigger/ao-infrastructure-check.ts`（新）
  - `lobster-factory/packages/workflows/src/trigger/dispatch-action-run.ts`（新）
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/build/runs/[id]/route.ts`（新）
  - `lobster-factory/packages/db/migrations/0023_dispatcher_enum_and_catalog_seeds.sql`（新）
- **Git**: 204ccfb（本輪 prerequisites + integrations open）; 04bc560（deploy.sh --no-deps）; b0e8c3b（上輪 workflows + UI 大批）
- **對應 TASKS 子字串（可選）**: Build Console one-click integrations
- **風險／待辦（可選）**: 遠端伺服器已 git pull + docker rebuild 完成（無單獨 commit）；migration 0023 尚未在 Supabase SQL Editor 執行（ops_action_runs status enum + trigger_run_id 欄位 + wp-basic/wp-business seeds 未入庫）；https://app.aware-wave.com/build 已上線可見前置帳號區與 integrations 欄位

### codex 2026-05-06 07:05

- **Summary**: Hardened and deployed the guarded Build Console path for `https://app.aware-wave.com/build`; the console supports Profile A `internal_setup`, Profile B `full_install`, and Profile C `adopt_delta` with plan/enqueue separation and audit-oriented queues.
- **Evidence**:
  - `npm run build` passed in `lobster-factory/infra/hetzner-phase1-core/apps/next-admin`.
  - `npm run validate` passed in `lobster-factory` after rerunning with the approved environment.
  - Local API smoke passed for Profile A, Profile B, Profile C blocked preflight, viewer rejection, and forged role rejection in production-like mode.
  - Supabase action catalog seed applied for the three Build Console actions.
  - Production Next Admin was rebuilt/restarted; active Nginx config includes `/api/build/` trusted-proxy headers; unauthenticated `https://app.aware-wave.com/build` returns `401`.
- **Git**:
  - Build Console hardening landed earlier as `60601c5 Harden Build Console deployment path`.
  - Current HEAD before this closeout entry: `204ccfb [claude] feat(build-console): prerequisites section + integrations open by default`.
- **Changed files in this closeout commit**:
  - `agency-os/.agency-state/closeout-inbox.md`
- **Not committed / follow-up**:
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/tsconfig.tsbuildinfo` is a generated build-info delta.
  - `Temp/next-admin-build-console.*.log` are local run logs.
  - `agency-os/ALERT_REQUIRED.txt` reports `verify-build-gates` failed on 2026-05-04 and should be handled separately.

---

### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:

---

### codex 2026-05-01 19:55

- **完成（一句）**: 完成 PostHog public/admin 站點命名與 live 驗證，讓 Aware Wave Website、Aware Wave Admin、Soulful Expression 可用一致屬性分流。
- **證據／檔案**:
  - `lobster-factory/infra/hetzner-phase1-core/apps/wordpress/mu-plugins/posthog.php`
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/providers.tsx`
  - Live SG：`lobster-wordpress` / `lobster-next-admin` 均 healthy；`aware-wave.com` HTML 已含 `site_name: "Aware Wave Website"`；`next-admin` bundle 已含 `site_name:"Aware Wave Admin"`。
- **Git**: pending commit in this turn.
- **對應 TASKS 條目若未打勾**: 無，本輪為 PostHog/observability 設定收斂，未對應單一未完成 TASKS 勾選。
- **風險／待辦若未完成**: `soulfulexpression.org` 仍需在 Hostinger WordPress 透過 WPCode/Header injection 或同等 MU plugin 貼入 PostHog snippet，才能開始送事件；本 repo 已預留 `Soulful Expression` site_name 映射。
