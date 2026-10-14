# IDE 企業級規則索引（Cursor + Claude Code 並存）

> **狀態**：Cursor 於 2026-08-26 退場；本檔保留歷史對照與遷移證據，不是現行操作入口。
> **現行 SSOT**：`CLAUDE.md` + `agency-os/AGENTS.md` + `mcp/registry.template.json`。Cursor 段落僅保留歷史對照。

## § Claude Code 對應一覽

| 機制 | Cursor（歷史退場） | Claude Code（歷史對照） |
|------|--------|------------|
| 專案規則 | `agency-os/.cursor/rules/*.mdc` | `CLAUDE.md` + `@agency-os/AGENTS.md`（自動載入） |（歷史退場對照）
| Hook：AO-RESUME | `.cursor/hooks.json` `beforeSubmitPrompt` | `~/.claude/settings.json` `UserPromptSubmit` |（歷史退場對照）
| Hook 腳本 | `.cursor/hooks/run-ao-resume-on-prompt.ps1` | `~/.claude/hooks/ao-resume-on-prompt.ps1` |（歷史退場對照）
| MCP 伺服器 | `.cursor/mcp.json`（project-scoped） | `.mcp.json`（共用 SSOT，兩邊都讀） |（歷史退場對照）
| Commit prefix | `[cursor]` | `[claude]` |
| 狀態輸出 | `agency-os/.agency-state/ao-resume-hook-last.json` | **同一檔案**（共用，每 session 一次） |

---

## § Cursor 企業級規則（歷史原始正本；已退場）

> 以下內容全部是 Cursor 退場前的歷史對照，不得作為現行操作指示。

## Settings 畫面 vs 版控（為什麼「沒有幫你填 Cursor 裡的列表」）

| 你看到的 | 實際上是 | Agent 從對話能做的 |
|----------|----------|-------------------|
| **Settings → Rules, Skills, Subagents** 裡的條目（含 `10`–`50`、或 Cloudflare／Sentry 等） | 多半在 **本機／帳號／外掛市集**（使用者 rules、`~\.cursor\`、Plugin 自帶 **Skill**），**不會**因為改 repo 就自動變成你截圖上的每一列 | **無法**替你登入 Cursor 帳號、無法遠端點選 UI、也無法改外掛內建的描述文字（例如 Sentry 工具列上像 `name: actions` 的佔位說明常是 **套件自己带的**，不是要你在某表單「填好的欄位」）。 |（歷史退場對照）
| **`agency-os/.cursor/rules/*.mdc`**（含 `63`–`66`）與 **`00`／`30`／`40`** | **專案版控規則**：用 **monorepo 根或 `agency-os` 當工作區根** 開啟，並讓 Cursor **套用該資料夾的 Project Rules** 即會生效 | **可以**：在 git 裡維護、推送、`doc-sync` 連動（我們已做的是這一層）。 |（歷史退場對照）

**若你希望「畫面上看到的」與公司交付一致**：請以 **開對資料夾**（建議 `Work-Monorepo.code-workspace` 或 repo 根）為主，並以本檔與 `README-部署說明.md` 的 **部署與正本**為準；帳號層全域 rules（截圖中 `30`／`40` 等）屬你本機／團隊同步策略，需在你方 Cursor 環境自行對齊或匯入，**不靠聊天自動完成**。

## 正本在哪裡？

| 位置 | 用途 |
|---|---|
| **`agency-os/.cursor/rules/63-cursor-core-identity-risk.mdc`** | **精簡強制條款**（每次載入）：身分、主動偵測、商業視角、溝通／衝突／情境、風險分級、輸出分工；**完整長文與十一段模板脈絡**在 **`../docs/spec/raw/Cursor  Rules for AI/00-CORE.md`**（**長文參考／溯源**，非全系統實情 SSOT；與 `00/30/40`／`AGENTS`／`TASKS`／路由規格衝突時以上位與營運 SSOT 為準） |（歷史退場對照）
| **`agency-os/.cursor/rules/64-architecture-mcp-routing.mdc`** | 架構分層、MCP／工具職責（**細節以下方 SSOT 為準**） |（歷史退場對照）
| **`agency-os/.cursor/rules/65-build-standards-data-state.mdc`** | DB／狀態機／專案結構（**僅在對應 globs 下啟用**） |（歷史退場對照）
| **`agency-os/.cursor/rules/66-skills-observability-protocol.mdc`** | Skill 協議、可觀測性與 Phase 節奏 |（歷史退場對照）
| **`../docs/spec/raw/Cursor  Rules for AI/`**（monorepo 根下 `docs/spec/...`） | 拆檔溯源與歷史包；**部署時以 `agency-os/.mdc` 正本為準**（見該目錄 `README-部署說明.md`） |

## SSOT（權威文件）

- **長期治理口徑／文件與聊天信任邊界（Owner）**：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`（**§4** 可稽核真相順序、禁雙寫、三十年誠實範圍）；對外精簡：`docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER_CLIENT_SHORT.md`
- **規則版本／強制判定（Owner）**：`docs/operations/rules-version-and-enforcement.md`
- **龍蝦自動化路由（強制）**：`../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- **龍蝦路由矩陣（人讀）**：`../lobster-factory/docs/ROUTING_MATRIX.md`
- **龍蝦路由機讀閘道**：`../lobster-factory/workflow-risk-matrix.json`（驗證：`../lobster-factory/scripts/validate-workflow-routing-policy.mjs`）
- **Cursor MCP 鍵名與分工**：`docs/operations/cursor-mcp-and-plugin-inventory.md`
- **工具建置／能力追溯（TASKS ↔ 路由）**：`docs/operations/TOOLS_DELIVERY_TRACEABILITY.md`
- **Trigger vs n8n 編排邊界 ADR**：`docs/architecture/decisions/004-trigger-vs-n8n-orchestration-boundary.md`
- **憑證／祕鑰政策**：`docs/operations/security-secrets-policy.md`
- **多代理協作（Codex／他工具；非收關者）**：`docs/operations/collaborator-ai-agent-rules.md`
- **人＋代理總則**：`AGENTS.md`
- **新治理文件連動**：`docs/operations/new-doc-linkage-checklist.md`

## 維護時

0. **抗文件增殖**：開新治理／對外 `.md` **前**，必須先通過 `docs/operations/new-doc-linkage-checklist.md` 頂部「**預設：不要新增檔案**」三問；新增檔僅限最後手段（無 Owner 可 append）。
1. 改任一份 `.mdc` 或本索引：依 `docs/operations/new-doc-linkage-checklist.md` 更新矩陣／`change-impact-map.json`（或 `register-new-governance-doc.ps1`）。  
2. 改 **monorepo 根** `README.md` 關於開工／雙機／收工／Cursor 規則時：同步核對本索引、`REMOTE_WORKSTATION_STARTUP`、`EXECUTION_DASHBOARD`，避免敘述分叉。  
3. 跑 `doc-sync-automation.ps1 -AutoDetect` 與 `system-health-check.ps1`。  
4. **`63`–`66` 同步到 monorepo 根**：已自動化 — `verify-build-gates.ps1` 與 `doc-sync-automation.ps1`（Apply）會呼叫 **`scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`**；健檢會對四檔做 SHA256 比對（見 `README-部署說明.md` § Monorepo 根工作區）。

## Related Documents (Auto-Synced)
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `../README.md`
- `AGENTS.md`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/change-impact-map.json`
- `docs/DOCS_INDEX.md`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `docs/operations/security-secrets-policy.md`
- `docs/overview/30_YEAR_AI_CODING_EXEC_CHARTER.md`

_Last synced: 2026-10-14 00:16:07 UTC_

