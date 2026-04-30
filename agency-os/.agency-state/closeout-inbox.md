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

### claude-code 2026-04-30 17:00

- **完成（一句）**: 補齊 Rollback 機制、Staging 統一、Log 聚合三項缺口（腳本建立 + compose override + runbook + 7 份文件連動更新）
- **變更路徑**:
  - `lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh`（新增）
  - `lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml`（新增）
  - `lobster-factory/infra/hetzner-phase1-core/.env.staging.example`（新增）
  - `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`（新增）
  - `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`（§3 §1 §8 更新）
  - `agency-os/TASKS.md`（新增 3 項 Rollback/LogAgg/Staging 任務）
  - `agency-os/docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`（新增 3 行能力列）
  - `agency-os/docs/governance-plans/PLAN_30Y_STABILITY_HARDENING.md`（Phase 3 + Checklist 更新）
  - `agency-os/docs/CHANGE_IMPACT_MATRIX.md`（新增 DEPLOY_ROLLBACK_RUNBOOK 行）
  - `agency-os/docs/operations/hetzner-stack-rollout-index.md`（Phase B 新增 #15 Grafana/Loki）
  - `agency-os/docs/operations/OPS_DOCS_INDEX.md`（基礎建設區塊新增入口）
- **Git**: 未 commit
- **對應 TASKS 子字串（可選）**: Rollback 機制 — phase1 compose 回版腳本演練
- **風險／待辦（可選）**: 三項缺口的「DoD」均需在 VPS 實際演練後才算完成；腳本與 compose 已就緒，演練步驟見各 TASKS 項目說明。Loki 部署需 VPS 上執行 observability compose。

### example-agent <yyyy-MM-dd 09:00>

- **完成（一句）**: 已依範本建立收件匣流程
- **變更路徑**:
  - `agency-os/docs/operations/closeout-inbox-TEMPLATE.md`
- **Git**: （填 hash 或「未 commit」）
- **對應 TASKS 子字串（可選）**:
- **風險／待辦（可選）**:
