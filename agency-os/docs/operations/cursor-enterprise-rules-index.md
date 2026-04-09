# Cursor 企業級規則（可賣系統／版控正本）

## 這是什麼？

整合多模型產出的 **IDE 行為規範**（身分、風險、架構面、MCP 路由、資料／狀態機紀律、Skill／可觀測性），**以本 repo 為單一真相**，與 **AO 關鍵字、收工閘道、龍蝦 Routing** 對齊，避免「Settings 貼一大段卻沒進 git」的交付風險。

## Settings 畫面 vs 版控（為什麼「沒有幫你填 Cursor 裡的列表」）

| 你看到的 | 實際上是 | Agent 從對話能做的 |
|----------|----------|-------------------|
| **Settings → Rules, Skills, Subagents** 裡的條目（含 `10`–`50`、或 Cloudflare／Sentry 等） | 多半在 **本機／帳號／外掛市集**（使用者 rules、`~\.cursor\`、Plugin 自帶 **Skill**），**不會**因為改 repo 就自動變成你截圖上的每一列 | **無法**替你登入 Cursor 帳號、無法遠端點選 UI、也無法改外掛內建的描述文字（例如 Sentry 工具列上像 `name: actions` 的佔位說明常是 **套件自己带的**，不是要你在某表單「填好的欄位」）。 |
| **`agency-os/.cursor/rules/*.mdc`**（含 `63`–`66`）與 **`00`／`30`／`40`** | **專案版控規則**：用 **monorepo 根或 `agency-os` 當工作區根** 開啟，並讓 Cursor **套用該資料夾的 Project Rules** 即會生效 | **可以**：在 git 裡維護、推送、`doc-sync` 連動（我們已做的是這一層）。 |

**若你希望「畫面上看到的」與公司交付一致**：請以 **開對資料夾**（建議 `Work-Monorepo.code-workspace` 或 repo 根）為主，並以本檔與 `README-部署說明.md` 的 **部署與正本**為準；帳號層全域 rules（截圖中 `30`／`40` 等）屬你本機／團隊同步策略，需在你方 Cursor 環境自行對齊或匯入，**不靠聊天自動完成**。

## 正本在哪裡？

| 位置 | 用途 |
|---|---|
| **`agency-os/.cursor/rules/63-cursor-core-identity-risk.mdc`** | **精簡強制條款**（每次載入）：身分、主動偵測、商業視角、溝通／衝突／情境、風險分級、輸出分工；**完整長文與十一段模板脈絡**在 **`../docs/spec/raw/Cursor  Rules for AI/00-CORE.md`**（**長文參考／溯源**，非全系統實情 SSOT；與 `00/30/40`／`AGENTS`／`TASKS`／路由規格衝突時以上位與營運 SSOT 為準） |
| **`agency-os/.cursor/rules/64-architecture-mcp-routing.mdc`** | 架構分層、MCP／工具職責（**細節以下方 SSOT 為準**） |
| **`agency-os/.cursor/rules/65-build-standards-data-state.mdc`** | DB／狀態機／專案結構（**僅在對應 globs 下啟用**） |
| **`agency-os/.cursor/rules/66-skills-observability-protocol.mdc`** | Skill 協議、可觀測性與 Phase 節奏 |
| **`../docs/spec/raw/Cursor  Rules for AI/`**（monorepo 根下 `docs/spec/...`） | 拆檔溯源與歷史包；**部署時以 `agency-os/.mdc` 正本為準**（見該目錄 `README-部署說明.md`） |

## SSOT（權威文件）

- **龍蝦自動化路由（強制）**：`../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- **Cursor MCP 鍵名與分工**：`docs/operations/cursor-mcp-and-plugin-inventory.md`
- **憑證／祕鑰政策**：`docs/operations/security-secrets-policy.md`
- **人＋代理總則**：`AGENTS.md`
- **新治理文件連動**：`docs/operations/new-doc-linkage-checklist.md`

## 維護時

1. 改任一份 `.mdc` 或本索引：依 `docs/operations/new-doc-linkage-checklist.md` 更新矩陣／`change-impact-map.json`（或 `register-new-governance-doc.ps1`）。  
2. 改 **monorepo 根** `README.md` 關於開工／雙機／收工／Cursor 規則時：同步核對本索引、`REMOTE_WORKSTATION_STARTUP`、`EXECUTION_DASHBOARD`，避免敘述分叉。  
3. 跑 `doc-sync-automation.ps1 -AutoDetect` 與 `system-health-check.ps1`。  
4. **`63`–`66` 同步到 monorepo 根**：已自動化 — `verify-build-gates.ps1` 與 `doc-sync-automation.ps1`（Apply）會呼叫 **`scripts/sync-enterprise-cursor-rules-to-monorepo-root.ps1`**；健檢會對四檔做 SHA256 比對（見 `README-部署說明.md` § Monorepo 根工作區）。

## Related Documents (Auto-Synced)
- `../docs/spec/raw/Cursor  Rules for AI/README-部署說明.md`
- `../lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- `../lobster-factory/docs/ROUTING_MATRIX.md`
- `../README.md`
- `.cursor/rules/63-cursor-core-identity-risk.mdc`
- `.cursor/rules/64-architecture-mcp-routing.mdc`
- `.cursor/rules/65-build-standards-data-state.mdc`
- `.cursor/rules/66-skills-observability-protocol.mdc`
- `AGENTS.md`
- `docs/CHANGE_IMPACT_MATRIX.md`
- `docs/change-impact-map.json`
- `docs/operations/cursor-mcp-and-plugin-inventory.md`
- `docs/operations/new-doc-linkage-checklist.md`
- `docs/operations/security-secrets-policy.md`
- `docs/README.md`

_Last synced: 2026-04-09 09:29:25 UTC_

