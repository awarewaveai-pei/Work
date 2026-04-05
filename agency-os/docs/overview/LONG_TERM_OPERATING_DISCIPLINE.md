# 長期營運紀律（30 年級）

> **單一用途**：把「能讓 monorepo **活得久、換人仍能接**」的取捨寫成 **短憲章**；細節仍在各 SSOT（`REMOTE_WORKSTATION_STARTUP`、`MCP_TOOL_ROUTING_SPEC`、`SECURITY` 等）。  
> **非雞湯**：下面每條都應能對應 **可驗證動作**（閘道、檔案主人、或明確禁止）。

## 1. 無聊勝過聰明（Boring wins）

- 優先 **業界預設、文件多、易招聘** 的技術；新奇 stack 要有 **退場策略** 再進主線。
- **少而硬的自動化**：寧可少腳本，也不要多個重疊 checker；既有 **`verify-build-gates`**、**`system-health-check`**、**`AO-CLOSE`** 就是主幹。

## 2. 單一真相（Single Owner）

- **一份政策／流程只保留一個 Owner 檔**；他處僅「一句 + 連結」。見 `AGENTS.md` 文件治理、`docs/operations/new-doc-linkage-checklist.md`。
- **範本與路徑索引**：`docs/overview/repo-template-locations.md`（避免兩套 `templates` 語意混談）。

## 3. 平面分界（別糊成一鍋）

- **控制**（誰能批）／**執行**（workflow、agent）／**資料**（SoR、schema）／**可觀測** 分開；生產寫入只走核准路徑。見 `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`、`docs/operations/cursor-mcp-and-plugin-inventory.md`。

## 4. 節奏與證據（Rhythm & evidence）

- **開工／收工**：`AO-RESUME` / `AO-CLOSE` 與 `REMOTE_WORKSTATION_STARTUP`、`end-of-day-checklist`；**真相**仍在 `TASKS` / `WORKLOG` / `memory`，看板僅視圖。
- **釋出與變更**：staging-first、備份與 rollback 證據；tenant 層見 `tenants/templates/core/RELEASE_GATES_CHECKLIST.md`、`BACKUP_RESTORE_PROOF.md`。

## 5. 相容與退役（Compatibility）

- **破壞性變更**需：**版本說明**（`docs/releases/*`）、**遷移步驟**、**回滾**；大型分歧補 **ADR**（`docs/architecture/decisions/`）。
- **依賴**：重大升級前跑既有閘道；對 `npm audit fix --force` 等 **高風險** 操作維持「先評估再動」紀律（見 `TASKS` Backlog Trigger 相關註記）。

## 6. 祕密與合規（Non-negotiable）

- **祕密不入庫、不入 WORKLOG／memory／聊天**；見 `docs/operations/security-secrets-policy.md`。
- **個資／跨境**：索引在 `tenants/templates/core/CROSS_BORDER_GOVERNANCE.md`；**結論**交外部顧問，repo 只存事實與狀態。

## 7. 觀測性（剛剛好）

- **先能查 log／報告／健康分數** 再談大規模 paging；與 `.cursor/rules/66-skills-observability-protocol.mdc` 對齊階段目標。

## 8. 人類可續接（Bus factor）

- **新機／雙機**：`REMOTE_WORKSTATION_STARTUP`；**決策留痕**：`WORKLOG` + 必要時 ADR。
- **檔名可讀**：`TYPE_SCOPE_PURPOSE`（`AGENTS.md`）；禁 `final-v2` 式命名。

## 9. AI 與自動化（輔助；永遠不是權威）

> **Coding**：人＋CI 仍以 **型別、閘道、遷移、PR** 為契約；AI 可加速草稿，**不可**替代 review 或繞過 `verify-build-gates`。  
> **專案管理**：`TASKS`／`WORKLOG`／`memory` 為進度真相；看板僅視圖；重大分岔 **ADR + WORKLOG**。  
> **AI 代理／MCP**：僅能在 **核准平面** 允許的範圍內動手；**生產寫入 SoR** 與長編排 **Routing Spec** 說了算，不是「模型覺得方便」。

- **草稿與探索**：產生命令稿、查結構、草擬 ADR 段落；**定稿**須過真人與閘道。
- **工具邊界**：`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`、`docs/operations/cursor-mcp-and-plugin-inventory.md`；**身分／租戶** 見 ADR 002、006。
- **禁止**：以聊天或 AI 輸出覆寫 **祕密、RLS、核准規則**；以「少一步驗證」換短期省力。
- **可驗證**：與 AI 相關之 **高風險** 變更（schema、權限、workflow 路由）仍須 **staging 證據**＋既有釋出閘道。

## 10. 執行節奏（原則 → 日曆）

> 目標：30 年後仍能 **照表操課**；下列命令以 **monorepo 根**為準（路徑見 `REMOTE_WORKSTATION_STARTUP`）。

| 時機 | 做什麼 | 驗證／產物 |
|------|--------|------------|
| **合併／收工前** | `powershell -ExecutionPolicy Bypass -File .\scripts\verify-build-gates.ps1` | 龍蝦 bootstrap、`verify-adr-index`、Agency `system-health-check` |
| **跨平面或破壞性變更** | 新增／修訂 **ADR** + 更新 `docs/architecture/decisions/README.md` 索引 | 同上閘道；見 `CHANGE_IMPACT_MATRIX` |
| **客戶釋出或重大變更** | 依 `tenants/templates/core/RELEASE_GATES_CHECKLIST.md`；備份與還原證據 | `BACKUP_RESTORE_PROOF.md` 模板與實填 |
| **每日開工／收工** | `AO-RESUME`（含 Git 對齊）；`AO-CLOSE`（含 doc-sync／guard／integrated status） | `.cursor/rules/30-resume-keyword.mdc`、`40-shutdown-closeout.mdc` |
| **新機／雙機** | `REMOTE_WORKSTATION_STARTUP` §1.5／§2；`machine-environment-audit.ps1 -FetchOrigin` | `TASKS.md`「雙機環境對齊」勾選條件 |
| **依賴與 CVE** | 審閱 `npm audit`；**禁止**對 `lobster-factory/packages/workflows` 盲目 `npm audit fix --force` | `TASKS.md` Backlog（Trigger 傳遞依賴） |

**12 個月內建議完成的工程錨點（與 ADR 006 一致）**：在 Supabase 落地 **RLS + 租戶鍵 + Clerk 組織對照表**（migrations），並於 **staging** 用自動化或手動測試證明 **無跨租戶讀寫**；未落地前不宣稱多租戶資料層「已封閉」。**已提供基線 migration**：`lobster-factory/packages/db/migrations/0010_clerk_org_mapping_and_rls_expansion.sql`（須套用至遠端 DB 並配置 JWT org claim）。

## Related

- **§9 工具與核准平面**：`../../../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`、`../operations/cursor-mcp-and-plugin-inventory.md`
- `docs/architecture/decisions/001-wordpress-manifest-and-shell-ssot.md`、`docs/architecture/decisions/002-clerk-identity-boundary.md`、`docs/architecture/decisions/003-no-automated-manifest-dual-sync.md`、`docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md`、`docs/architecture/decisions/005-supabase-sor-vs-wordpress-runtime-db.md`、`docs/architecture/decisions/006-supabase-tenant-isolation-and-clerk-mapping.md`
- `AGENTS.md`
- `TASKS.md`（動態優先序與試點）
- `docs/overview/REMOTE_WORKSTATION_STARTUP.md`
- `docs/overview/repo-template-locations.md`
- `docs/architecture/decisions/README.md`
- `docs/operations/NEXT_GEN_DELIVERY_BLUEPRINT_V1.md`
