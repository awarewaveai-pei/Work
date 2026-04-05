# ADR 002: 應用層身分預設採 Clerk（邊界與非目標）

- **狀態**：已接受（承接既有 C5 選型；本檔把 **邊界** 寫死以利審計）
- **日期**：2026-04-02

## 脈絡

- Monorepo 同時含：**自架產品／控制台／非 WordPress 原生流程**、**龍蝦工廠**、**多租戶 WordPress 代操**。
- 需選 **預設身分供應商（IdP）** 給「我們寫的應用」：登入、組織／成員、會話、與 edge（如 Cloudflare）整合。既有 WORKLOG／TASKS 已記 **Identity = Clerk**。
- 風險：若邊界不清，會誤把 **Clerk** 當 **WP 會員**、或與 **Supabase RLS／Trigger 核准** 混線，造成權限與 SoR 混亂。

## 決策

1. **預設 IdP（我們交付的 App／控制台／內部營運介面）**：採 **Clerk**（含 Organizations／RBAC 能力依產品需要啟用）。
2. **資料與授權 SoR**：**業務資料、審批狀態、workflow 狀態** 仍以 **Postgres（Supabase）與既定 API／RLS** 為準；Clerk 提供 **身分與 JWT／session**，應用層負責 **把 `sub`／org 對應到租戶列**（具體 schema 與 webhook 不在本 ADR 展開）。
3. **明確非目標（除非專案 SOW 另訂並留證據）**：
   - **不**預設以 Clerk **取代** 客戶 **WordPress 站台** 的終端使用者登入（例如 Woo 會員、LearnDash、社群外掛之帳號體系）。
   - **不**以 Clerk **繞過** `MCP_TOOL_ROUTING_SPEC`、Trigger 核准、或 production 寫入閘道。
4. **若需更換 IdP**（WorkOS、Auth0、自建 OIDC）：必須 **新 ADR** + 遷移計畫 + 雙跑／回滾窗口；**禁止**無 ADR 的「偷偷換鍵名」。

## 後果

### 正面

- 與既有 Enterprise 路線、Cursor Clerk skill、Cloudflare 整合慣例對齊；新人只記「**App 登入找 Clerk**」。
- 邊界寫死後，**WP 代操**與 **自架 SaaS** 不會在文件上混成同一套帳號。

### 負面／代價

- 供應商鎖定與計價依賴；遷移需工程與法遵檢視。
- Clerk ↔ Supabase 使用者對應須維護（webhook／job），**技術債要顯式排程**，不可口頭約定。

### 需跟進文件／腳本

- `docs/operations/security-secrets-policy.md`（Clerk keys 存放與輪替敘述若有缺口則補）
- `docs/operations/cursor-mcp-and-plugin-inventory.md`（若 MCP／外掛與 Clerk 相關）
- `TASKS.md`「Enterprise 工具層 Phase 1 正式串接」完成時於 `WORKLOG` 附 **環境／redirect／webhook** 索引（**不**貼 secret）

## Related

- `WORKLOG.md`（C5 選型紀錄）
- `docs/overview/PROGRAM_TIMELINE.md`（OP-2、LF-C54）
- `lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`
- ADR 001（manifest／shell；與身分正交）
- ADR 004／005／006（編排、資料平面、租戶隔離；Clerk 不取代 SoR）
