# CURSOR RULES — 部署說明（v1.1 · 與 Agency OS 版控對齊）

## 重要：正本已進 repo

**單一真相**在 **`agency-os`**（可 `git pull` 給客戶／同事）：

| 正本（請改這裡） | 用途 |
|---|---|
| **`agency-os/.cursor/rules/63-cursor-core-identity-risk.mdc`** | 身分、風險分級、紅線（與 `AO`／`00/30/40` 衝突時以後者為準） |
| **`agency-os/.cursor/rules/64-architecture-mcp-routing.mdc`** | 架構分層、MCP／工具路由（細節以 inventory + `MCP_TOOL_ROUTING_SPEC` 為準） |
| **`agency-os/.cursor/rules/65-build-standards-data-state.mdc`** | DB／狀態機／結構（**globs** 限定程式與 SQL 路徑） |
| **`agency-os/.cursor/rules/66-skills-observability-protocol.mdc`** | Skill 協議、可觀測性、與 heartbeat 規則搭配 |
| **`agency-os/docs/operations/cursor-enterprise-rules-index.md`** | **索引頁**（連動矩陣 + `change-impact-map.json` 已登記） |

本目錄下之 **`00-CORE.md`、原 `01`–`03` 內容** 為多模型產出之**溯源／長文參考**（**含歷史時點的寫法**，未必已逐字追平今日選型與閘道）；**部署、販售與「現在系統怎麼跑」**請以 **`agency-os` 內 `.mdc`** + **`TASKS`／`MCP_TOOL_ROUTING_SPEC`／營運 SSOT** 為準。

## Monorepo 根工作區（`Work/.cursor/rules`）

若使用 **`Work-Monorepo.code-workspace`** 且工作區根為 **monorepo 根**，Cursor 通常只載入 **該根目錄下** `.cursor/rules`。**自動化**：repo 根 **`scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`** 會把 **`63`–`66` 四檔**從 **`agency-os/.cursor/rules/`** 覆蓋到 **`Work/.cursor/rules/`**；在執行 **`verify-build-gates.ps1`** 或 **`agency-os/scripts/doc-sync-automation.ps1`**（Apply 模式）時會**自動**執行。單獨手動同步：`powershell -ExecutionPolicy Bypass -File .\scripts\sync-enterprise-cursor-rules-to-monorepo-root.ps1`。僅檢查是否一致（不寫檔）：同指令加 **`-VerifyOnly`**；**`system-health-check`** 亦會對四檔做 **SHA256** 比對。

## 可選：全域 Cursor Settings

若仍想在 **Cursor → Settings → Rules for AI** 貼一小段：請只貼 **與本專案無關的個人偏好**，或一句「專案規則以 `agency-os` 內 `.cursor/rules` 與 `AGENTS.md` 為準」，避免與版控規則**兩套打架**。

## 本目錄檔案（歷史包）

| 檔案 | 說明 |
|---|---|
| `00-CORE.md` | **完整長文參考**（探索／商業思維／PROTOCOL／十一段模板）；**非**全系統實情 SSOT；執行條款以 **`63`** 為準 — **衝突以 AO／`AGENTS`／`00`/`30`/`40` 與 TASKS／路由規格為準** |
| `01-arch-and-tools.mdc` | **溯源草稿**；現用條款已融入 **`64`**（讀本檔勿當作最新 MCP 路由敘述） |
| `02-build-standards.mdc` | **溯源草稿**；現用條款已融入 **`65`** |
| `03-skills-and-observability.mdc` | **溯源草稿**；現用條款已融入 **`66`** |

## 主動對齊（不要等人發現才修）

- **每次**變更 **`MCP_TOOL_ROUTING_SPEC.md`** 或 **`cursor-mcp-and-plugin-inventory.md`**（或其對應的 `mcp.json` 鍵／路徑）：複核本目錄 **`01-arch-and-tools.mdc`** 的 MCP 表是否仍為**善意速查**（必要時只改註記與「以 spec 為準」句，**避免**與 inventory 長期雙軌叙述）。  
- **每次**變更 **選型／Phase 1 工具**（`TASKS`、`tools-and-integrations`）：複核 **`03`** 範本句是否與 TASKS 矛盾。  
- **龍蝦 schema／migration**：複核 **`02`** 範本是否與 `lobster-factory` 實際 DDL 明顯衝突。  
- **機器檢查**：`node lobster-factory/scripts/validate-doc-integrity.mjs`；合併變更後跑 **`system-health-check.ps1`**。

## 維護後必做（連動）

1. 改任一份 `agency-os` 內上述檔案 → 依 **`docs/operations/new-doc-linkage-checklist.md`**（或 `register-new-governance-doc.ps1`）與 **`doc-sync-automation.ps1` + `system-health-check.ps1`**。

## Related（連回索引）

- `agency-os/docs/operations/cursor-enterprise-rules-index.md`

## Related Documents (Auto-Synced)
- `.cursor/rules/63-cursor-core-identity-risk.mdc`
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `.cursor/rules/65-build-standards-data-state.mdc`
- `.cursor/rules/66-skills-observability-protocol.mdc`
- `docs/operations/cursor-enterprise-rules-index.md`

_Last synced: 2026-04-01 02:31:21 UTC_

