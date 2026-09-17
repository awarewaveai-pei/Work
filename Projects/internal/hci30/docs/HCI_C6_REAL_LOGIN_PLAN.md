# HCI-30 C6 — 真實登入串接計畫（P9 Task Prompts）

> 來源：`planner` agent 產出，2026-09-17。對應 [`HCI_C1_C10_DECISIONS.md`](HCI_C1_C10_DECISIONS.md) §C6（DEFERRED，2026-09-12 操作者確認「先不動」）。**本文件僅供審閱，非執行授權** — 見下方狀態聲明。
>
> **2026-09-17 `db-expert` 審查 Task 1(B)/Task 2 設計，發現 5 個 Critical 缺陷**（見 Task 2 區塊末尾「db-expert 審查結果」）——原始草案的 `provision_tenant_role(p_organization_ref, p_role_name)` 簽章讓呼叫者指定 Postgres role 名稱，是**跨租戶劫持漏洞**；缺 `SET row_security = off` 會在 `hci_owner` 非 superuser 的正式環境 fail-open/fail-closed 都可能發生；`hci_owner` 直接持有 `CREATEROLE` 在 PG15.8 上不安全；缺 `jurisdiction` 參數會讓 ADR-0012 的司法管辖法遵閘形同虛設；此函式絕不能對 `wave1-negative-tests.sql` 用的同一顆資料庫跑（會炸 `ARCH-PEER-02b` 信任邊界測試）。Task 3 執行前必須先套用修正設計，不得照字面實作原始草案。

## 狀態聲明(優先於以下所有內容)

本計畫僅供審閱，非執行授權。`HCI_C1_C10_DECISIONS.md:95-103`(C6)已明確記載「DEFERRED — High-risk STOP，需另外 go-ahead」「不因『全權授權』而跳過」；操作者 2026-09-12 對 C6 的答覆是「先不動」(同檔 `:150`)。本文件所有任務在收到操作者針對本文件的明確 go-ahead 前，一律不得開始；標記 **STOP** 的任務即使拿到「開始執行這份計畫」的授權，仍須逐項再問一次(規則優先序：High-STOP 不因整批授權跳過)。

## Definition of Done

一個真實 portal 客戶(`portal.aware-wave.com` 已登入、`organization_product_subscriptions.product_key='hci'` 狀態 `active`)可從 launcher 進入 `hci.aware-wave.com`，在不手動指定 tenant 的情況下被正確綁定到專屬 HCI Tenant + Postgres role，其 API 呼叫通過 RLS 隔離；`?tenant=a|b` 查詢參數與寫死的 `TENANT_ROLES` map(`Projects/internal/hci30/app/server.mjs:28-34`)被移除；`TENANT-ADAPTER-NEG-01..03`(`agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md:12-14`)全數通過；HCI-30 有一個真實 production 部署。

## Current State Analysis

**Portal 身分層(`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`)**
- Supabase Auth SSR，cookie 無 `domain` 屬性(`lib/supabase/ssr.ts` 全檔、`lib/supabase/route-client.ts` 全檔皆未設)→ host-only cookie，`portal.aware-wave.com` 的 session 對 `hci.aware-wave.com` 不可見。
- `middleware.ts:176-221` 用 host header 鎖 `/portal/*` 只能在 `portal.aware-wave.com` 執行；`lib/tenant-guard.ts:146-154` `requireClientOrg()` 是 portal 專用 fail-closed 變體(`resolveTenant()` 本身對 admin console 是 fail-open，見 `:30-56` 註解——portal 路由禁止直接呼叫 `resolveTenant()`)。
- `organization_product_subscriptions`(`lobster-factory/packages/db/migrations/0062_organization_product_subscriptions.sql:76-88`)：`external_tenant_id` 刻意非 FK(`:22-25` 註解)，寫入僅限 `service_role`(`:41-47`)，一個 org 一個 product 只能有一筆 live 訂閱、一個 tenant 只能被一個 live claimant 持有(`:102-118` 兩個 partial unique index)。
- `lib/portal/products.ts:6-32`：launcher 產品清單，`hci` 目標網域 `hci.aware-wave.com`，狀態寫死 `coming_soon`，型別已支援切成 `available`(`:19-26` 註解)但無程式碼路徑會真的切換。
- `PORTAL_SIGNUP_ENABLED` 未設(`agency-os/TASKS.md:874`)，公開註冊尚未開放；重開條件之一即「任一產品有真實 provisioning API 可接」(`:876`)。

**HCI-30(`Projects/internal/hci30/`)**
- `app/server.mjs:28-113`：唯一存在的「auth」是 query param `?tenant=a|b` 對照寫死 `TENANT_ROLES`/`TENANT_IDS`；`app/README.md:14-16` 明講「Not an auth system」。
- Fixture role：`database/migrations/0001_wave1_synthetic_up.sql:278-291` `CREATE ROLE hci_app_test_a/b NOLOGIN NOBYPASSRLS`，`hci.current_tenant_id()` 讀 `current_setting('role')` 對照 `hci.app_tenant_bindings`。此機制已被 `api/API_CONTRACT_STANDARD.md:15-17` 列為 **CLOSED**：「role-based，非 `SET LOCAL app.tenant_id`」——任何新設計要嘛延用此機制，要嘛提新 ADR 推翻它(`ADR-0009:30` 已明訂後續變更需新 ADR)。
- API host 是 `api.aware-wave.com/hci/v1/`(ADR-0003，`API_CONTRACT_STANDARD.md:7-9` CLOSED)，跟 launcher 導向的 `hci.aware-wave.com`(產品前端)是兩個不同子網域；gateway 只能路由，不得含 HCI 業務詞彙(`:51-53` gate)。gateway 服務是 `lobster-factory/infra/hetzner-phase1-core/apps/node-api/src/index.js`(單檔，目前無通用 proxy 中介層，需實作時再確認走 Express route 還是 nginx location block)。
- DB 是獨立 `postgres:15.8` container(`infra/local/compose.dev.yml:1-19`)，與 portal 用的 Supabase Postgres**不是同一顆**——prod 尚無對應部署，`infra/local/` 只有 dev/test compose。
- Auth scope 分級(`API_CONTRACT_STANDARD.md:11-13`)標 PARTIAL，`actor_id`/`service_account_id`(`:19-21`)標 PARTIAL；`TENANT_CONTEXT_STANDARD.md` 的 `actor_id`/`service_account_id`/`request_id`/`data_region`/`policy_context` 五欄留 OPEN，明確原因「P0-06 API contract 不存在前無法有意義定義」(`agency-os/TASKS.md:1026`)。

**ADR-0009 / adapter contract(已 ACCEPTED，未實作)**
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0009-tenant-organization-model-reconciliation.md:12-14` 決議：portal `organizations` 是 adapter，不是第二個 Tenant 正本；HCI 自己擁有 `tenant_id`。
- `:96-102`(2026-09-05 補記)結論：gate 1-2(mapping/migration plan)已被 `0062` migration 滿足，**HCI 這邊不需要新增 schema**；gate 3(cross-tenant negative test)真被卡在「HCI 沒有可執行的 API」——下一步明確是「一個橫跨 `lobster-factory`(讀 subscription seam)與 `hci30`(把解析出的 tenant 綁進 request-scoped role/session)的 adapter/API 層任務」。
- Contract 細節：`.../wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md:17-33`(不得互查對方 DB、必須簽章/版本化的 API/event adapter、provisioning 必須 idempotent、失敗必須 fail-closed 且 operator-visible)。

**結論**：呼叫方向已由 contract 定案(portal 讀自己的 subscription 表 → 呼叫 HCI API)，不是待決策項。真正待決策的只有兩件：(A) 瀏覽器端 session 如何跨子網域傳遞身分、(B) HCI 端 tenant/role 要怎麼在 runtime 建立且不牴觸上述 CLOSED 機制。

## Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| R1 跨網域 handoff 機制設計不良 → session 劫持/CSRF | M | H | Task 1 決策 + Task 11 深度 critic(AGENTS §4：auth 類全面獨立重新推導，非抽查) |
| R2 runtime `CREATE ROLE` = 特權升級面 + 角色數量隨客戶數成長無上限 | M | H | Task 2 db-expert 審查 + Task 1 決策需比較「排隊式/審計過的 admin 觸發 provisioning」替代方案 |
| R3 `ks-aw-01` 單機資源緊(AGENTS §0：記憶體/硬碟 60% 門檻)，新增獨立 Postgres container + app service 是真成本 | M | M | Task 9 部署前先查現有 headroom；評估「與現有 Postgres instance 共用叢集開新 database」vs 全新 container，不預設複製一份 |
| R4 gateway 混入 HCI 業務詞彙，違反 logic-purity CLOSED 邊界 | L | M | Task 9 boundary 明訂禁止；沿用 `API_CONTRACT_STANDARD.md:51-53` 既有 grep gate 精神 |
| R5 為了 runtime role 而繞過/推翻 CLOSED 的 tenant-context 機制，卻未走新 ADR 流程 | L | H | Task 1 明訂必須先相容 `API_CONTRACT_STANDARD.md:15-17`；若結論是必須改，回 Planner 開獨立「破壞性 migration + 新 ADR」任務，不在本計畫隱性夾帶 |
| R6 忽略 C6 既有 DEFERRED 決議直接開工 | L | H | 本文件開頭狀態聲明；每個 STOP 任務執行前需操作者對「這一項」的明確 go-ahead，不接受整批授權 |
| R7 `SET ROLE` 依賴 owner 連線對新角色的 membership，新增角色時漏補 `GRANT <role> TO hci_owner` = 靜默 onboarding 失敗 | M | M | Task 3 acceptance 必須含「完整 grant chain 真跑通過」測試，不只 `CREATE ROLE` 本身 |
| R8 provisioning 呼叫重試/重複 → 非 idempotent 或跨 tenant 誤綁 | M | H | Task 3/4 acceptance 直接對照 `HCI_WAVE1_NEGATIVE_TEST_SPEC.md:12-14` 三案例 |

## Task 1: 跨子網域身分傳遞 + Tenant/Role provisioning 模型決策 — dispatch to `decision-intelligence`
- **Goal**：產出兩個決策記錄：(A) `portal.aware-wave.com` 已登入客戶如何被 `hci.aware-wave.com` 承認身分；(B) HCI 端如何在 runtime 為新客戶建立 Tenant + Postgres role，且相容既有 CLOSED 機制。
- **Scope**：僅產出決策文件，不動程式碼。
- **Input**：`lib/supabase/ssr.ts`、`lib/tenant-guard.ts:146-154`(現有 fail-closed pattern 可否延伸)、`middleware.ts:58-67`(`hasValidSyncKey` 既有 service-to-service shared-secret 先例，服務對服務呼叫優先延用同款式，不必列入 (A)/(B) 決策範圍)、`API_CONTRACT_STANDARD.md:15-17`(CLOSED 約束)、`database/migrations/0001_wave1_synthetic_up.sql:278-291`(現有 fixture role 機制)、`HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md:17-33`、R1/R2/R5 risk 列。
- **Output**：`agency-os/reports/decisions/` 下一份決策記錄，含(A)selected 機制(如：短效簽章 handoff token 由 portal 核發、HCI 一次性兌換後自建 session；或其他方案，附淘汰理由)、(B)selected 模型(如：延伸現有 per-tenant NOLOGIN role at runtime；或提案推翻 CLOSED 機制並說明需要新 ADR)；每個方案附 rollback 與對 R2/R5 的具體回應。
- **Acceptance**：兩個決策點都有選定方案 + 至少 2 個淘汰方案的理由；(B) 明確回答「是否相容 `API_CONTRACT_STANDARD.md:15-17`」；操作者確認。
- **Boundaries**：不決定呼叫方向(已由 contract 定案：portal 呼叫 HCI)；不決定 gateway 路由實作方式(留給 Task 9)；不寫程式碼、不建 migration。

## Task 2: DDL 設計審查(runtime CREATE ROLE) — **已完成**（2026-09-17，`db-expert`）
- **Goal**：審查 Task 1(B) 選定方案的具體 DDL/GRANT 序列是否安全、可回滾、不牴觸既有 RLS。
- **Scope**：`Projects/internal/hci30/database/` 現有 migrations 唯讀審查；產出審查意見，不改 migration 檔。
- **Input**：Task 1 決策記錄、`database/migrations/0001_wave1_synthetic_up.sql:278-380`(既有 role/RLS/grant 全貌)。
- **Output**：審查意見(R7 grant chain 完整性、角色命名規則、cancel/offboarding 時角色如何回收、連線池 owner 權限邊界)。
- **Acceptance**：明確列出「若採用此設計，哪些 grant 語句必須在同一個 provisioning transaction 內」；R7 的具體失敗模式與偵測方式。
- **Boundaries**：不涉及 Task 1(A) 的 session 傳輸設計；不執行任何 DDL。

### db-expert 審查結果（2026-09-17，唯讀，無檔案異動）

原始草案 `hci.provision_tenant_role(p_organization_ref text, p_role_name name) RETURNS uuid` 有 5 個 Critical 缺陷，Task 3 開工前必須先修正設計：

1. **`p_role_name` 由呼叫者指定 = 跨租戶劫持漏洞**。若呼叫端傳入既有角色名（如 `hci_owner`），「idempotent find-or-create」邏輯會跳過 `CREATE ROLE`，直接把該既有角色綁定到新 tenant——任何以該角色連線的既有連線（含 `app/server.mjs` 預設的 `hci_owner` 連線）會被劫持成新租戶身分。**修正**：簽章移除 `p_role_name`，角色名由函式內部依 `tenant_id` 決定性生成（如 `'hci_tenant_' || replace(tenant_id::text,'-','')`），且新增 `H1023`（下一個可用碼，`database/ERROR_CODE_REGISTRY.md`）在命名撞號但綁定的 tenant_id 不同時拒絕。
2. **缺 `SET row_security = off`**。`hci.tenants` 是 `FORCE ROW LEVEL SECURITY`（`0001:377-379`）；本 repo 既有慣例是每個碰 RLS-forced 表的 `SECURITY DEFINER` 函式都要帶這個設定（`docs/domain/HCI_INVARIANTS.md:226-241`、`DEFINER-RLS-FAILCLOSED-01` 測試、先例 `0013_wave1_key_issuance_up.sql:55`）。在本 schema 自己文件記載的正式環境形狀（`hci_owner` 非 superuser，見 `0014:40-44`）下漏掉這行，find-or-create 的 SELECT 會 fail-open（比對錯 tenant）或 INSERT 直接被 RLS 擋下——provisioning 第一次真實呼叫就不會照設計運作。
3. **`hci_owner` 直接拿 `CREATEROLE` 在 PG15.8 不安全**。PG16 之前，持有 `CREATEROLE` 的角色可以把「任何」既有非 superuser 角色的成員資格授予「任何」其他角色（含自己），不需要對目標角色有 `ADMIN OPTION`——PG16 才收緊。`hci_owner` 已經是全 schema 的表/函式 owner，若同時擁有 `CREATEROLE`，一個 provisioning 函式裡的 bug 或注入就能拿到整個 schema 的控制權。**修正**：另建 `hci_provisioner` 角色，只給 `CREATEROLE`，不給任何表所有權/BYPASSRLS；provisioning 函式的 owner 設為 `hci_provisioner`，不是 `hci_owner`。
4. **簽章漏了 `jurisdiction`，讓 ADR-0012 法遵閘形同虛設**。`hci.tenants.jurisdiction`（`0003_wave1_regulatory_market_scope_up.sql:102-110`，denylist CHECK 擋 EU/EEA/GB 等）晚於原始草案引用的 `0001:278-380` 兩個 migration 才加入；草案沒有這個參數，每個真實 provisioning 呼叫都會靜默套用 `DEFAULT 'US'`，CHECK 永遠沒有真實值可擋。Task 3 排程前必須先補這個參數，或明確決定由 Task 4(portal 端) 負責提供。
5. **絕不能對 `wave1-negative-tests.sql` 用的同一顆資料庫跑**。`database/tests/wave1-negative-tests.sql:1293-1301`(`ARCH-PEER-02b`，ADR-0002 gate 3)會在偵測到 `hci_owner`/`hci_app_test_a`/`hci_app_test_b` 以外的任何角色時直接判定失敗——`infra/local/compose.dev.yml` 通常是開發者手邊唯一的本機 Postgres，Task 3 本機測試時很容易不小心對 `hci_wave1_synthetic` 跑一次真實 provisioning，永久污染這個信任邊界測試的假設。Task 3 必須對獨立的資料庫/實例跑，並考慮加一個 runtime guard（`current_database() = 'hci_wave1_synthetic'` 時直接拒絕 `CREATE ROLE`）。

Major 建議（強烈建議採納，非阻塞）：
- **不要在 runtime 內省 `information_schema` 重放 0001 的 grant 迴圈**——`hci_app_test_a/b` 的實際權限來自 0001 之後至少 14 個 migration 陸續補的 grant（0002/0004/0006/0008/0010/0012/0013/0014/0016/0017/0018/0019/0020），只重放 0001 會讓新角色權限嚴重不足，而且 runtime 內省沒有本 schema 既有的「hardcoded array + drift 斷言」safety net。**改用群組角色**：建一個 `hci_tenant_role NOLOGIN NOBYPASSRLS`，一次性手動授予完整標準權限集（比照 `hci_app_test_a` 現有權限，人工寫死、人工覆審，符合本 schema 既有慣例），新 per-tenant 角色一律 `GRANT hci_tenant_role TO <new_role>`（預設 `INHERIT`）取得權限——不動 `hci_app_test_a/b` 本身，`hci.current_tenant_id()` 的 `SET ROLE` 解析邏輯完全不受影響，未來新 migration 只需多授權一個群組角色，跟今天兩個角色的模式一致。
- **`hci.app_tenant_bindings` 缺 `UNIQUE(tenant_id)`**——目前只有 `PRIMARY KEY(role_name)`，沒有東西擋兩個不同角色綁同一個 tenant_id；併發 provisioning 呼叫可能讓一個租戶產生兩個角色。修正：加 `UNIQUE(tenant_id)` 或在 provisioning transaction 開頭用 `pg_advisory_xact_lock` 鎖 `p_organization_ref`。
- **既有 `queryAsTenant()`（`app/server.mjs:79-88`）的 `SET ROLE`/查詢/`RESET ROLE` 三個陳述式沒有明確 `BEGIN`/`COMMIT` 包裹**——今天安全只是因為 node-postgres 的 `pool.connect()` 把整個生命週期釘在同一條實體連線上；若 Task 9 之後在 HCI 自己的 Postgres 前面加 PgBouncer 且用 transaction pooling mode，三個陳述式可能落在不同 backend 連線，`SET ROLE` 完全無效但不報錯，等於繞過 RLS。這是**現有程式碼的既存缺口，與本次 C6 provisioning 設計無關**，但值得盡早修（包一層明確 transaction），或至少在 Task 9 排程時確認絕不用 transaction pooling mode。此項不阻塞 C6，未經操作者對「觸碰 tenant-resolution 程式碼」單獨確認前不會由本 session 逕自修改。
- Offboarding 正確順序（單一 transaction）：`DELETE FROM hci.app_tenant_bindings WHERE role_name=...` → `DROP OWNED BY <role>` → `DROP ROLE <role>`。不能比照 `0001_..._down.sql` 的 `DROP SCHEMA CASCADE` 前提（正式環境資料要保留）。

完整報告已存於本 session 紀錄，未落地成獨立檔案（純審查意見，Task 3 執行時直接依上述修正項設計即可，不需要另外去翻報告全文）。

## Task 3: HCI 端 provisioning adapter endpoint(建 Tenant + role) — dispatch to `fullstack-engineer` — **STOP(credentials/權限管理 + RLS 隔離邊界，需操作者對本項單獨 go-ahead)**
- **Goal**：新增一個 service-to-service endpoint，收到 portal 的 provisioning 請求後 idempotent 建立/取回 HCI Tenant，runtime 建立對應 Postgres role 並寫入 `hci.app_tenant_bindings`，回傳 `tenant_id`。
- **Scope**：`Projects/internal/hci30/app/`(新 route)、`Projects/internal/hci30/api/openapi/hci-v1.yaml`(新增此 endpoint 的 schema)、必要的新 migration(僅限「新增」不改既有表，若 Task 1(B) 判定需要改 `hci.current_tenant_id()` 則不在此任務範圍，見 Boundaries)。
- **Input**：Task 1(B) 決策、**Task 2 db-expert 審查結果的 5 個 Critical 修正項（見上方，必讀，原始草案簽章有跨租戶劫持漏洞）**、`HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md:24-32`(provisioning/lifecycle 表：duplicate request 必須回同一 tenant_id 且僅限同一 claimant、fail-closed)、`HCI_WAVE1_NEGATIVE_TEST_SPEC.md:12-14`。
- **Output**：新 endpoint(含 auth：沿用 `middleware.ts:58-67` shared-secret 模式，新建專屬密鑰，不重用 `OPS_PROXY_SHARED_SECRET`)、idempotency key 支援(`API_CONTRACT_STANDARD.md:27-29` 既有 convention)、新 migration(若需要)+ down migration。Provisioning 函式**不得**讓呼叫者指定 role 名稱（角色名內部依 tenant_id 決定性生成）、**必須**帶 `SET row_security = off`、owner 設為新建的 `hci_provisioner`(僅 `CREATEROLE`)而非 `hci_owner`、**必須**接受 `jurisdiction` 參數餵給 ADR-0012 的 denylist CHECK、**絕不**對 `hci_wave1_synthetic`(negative-test 用資料庫)執行。
- **Acceptance**：真跑重複呼叫同一 organization_id → 回傳同一 tenant_id；不同 claimant 呼叫同一 tenant_id → 409 拒絕；`SET ROLE` 對新建角色真的成功(R7)；R4 精神延續——這支 API 本身可以有 HCI 業務詞彙(它就是 HCI 服務)，但不得洩漏到 gateway 層；額外驗收：`ARCH-PEER-02b`(`wave1-negative-tests.sql:1293-1301`)在 provisioning 測試前後都持續通過，證明兩顆資料庫確實隔離。
- **Boundaries**：不得修改 `hci.current_tenant_id()` 定義或既有 migrations 0001-0019；不得直接查詢 portal/Supabase 的 DB(contract `:21`)；不觸碰 `lobster-factory/` 任何檔案；不得對 `hci_owner` 授予 `CREATEROLE`。

## Task 4: Portal 端 provisioning 整合 + launcher UI 狀態切換 — dispatch to `fullstack-engineer`
- **Goal**：subscription 變成 `active` 且 `product_key='hci'` 時，portal 呼叫 Task 3 endpoint 取得 `tenant_id` 並寫回 `external_tenant_id`；launcher 卡片依真實狀態顯示 `available`/`coming_soon`。
- **Scope**：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`、`app/portal/launcher/page.tsx`、新的 service-role 寫入路徑(沿用 `lib/supabase-server.ts` 的 `getSupabaseWriteClient()`)。
- **Input**：Task 3 的 endpoint 契約、`0062_organization_product_subscriptions.sql:41-47`(寫入僅限 service_role，不得改回 0010 的 CRUD pattern)。
- **Output**：一個觸發 provisioning 的路徑(建議：operator 手動觸發按鈕而非訂閱狀態變更自動觸發，符合「操作者手動 toggle 訂閱狀態」的 V1 現實，`0062` 註解 `:26-27`)、`external_tenant_id` 寫回、launcher 狀態依 `external_tenant_id IS NOT NULL` 判斷。
- **Acceptance**：`external_tenant_id` 為 NULL 時卡片必為 `coming_soon`(絕不可偽造已 provisioned 狀態，`products.ts:11` 既有約束)；provisioning 呼叫失敗時卡片維持 `coming_soon` 並顯示 operator-visible 錯誤，不得靜默。
- **Boundaries**：不得新增 `authenticated` 角色對此表的寫入權限；不得繞過 service_role 走前端直接寫 DB；不觸碰 `hci30/` 任何檔案。

## Task 5: 服務間信任憑證(provisioning shared-secret + handoff 簽章金鑰) — dispatch to `devops-engineer` — **STOP(credentials)**
- **Goal**：為 Task 3 的 service-to-service 呼叫、Task 6/7 的 handoff token 產生並落地新密鑰。
- **Scope**：`mcp/user-env.template.ps1` + 各機 `mcp/user-env.ps1`(不進 git)、`scripts/secrets-vault.ps1`、prod 環境變數檔(部署時交給 Task 9)。
- **Input**：Task 1 決策(handoff 機制決定金鑰型態：對稱 shared-secret 或簽章金鑰對)。
- **Output**：新密鑰產生 + vault 登記 + template 更新；不含任何硬編值進 git。
- **Acceptance**：`scripts/secrets-vault.ps1 -Action get -Name <NEW_KEY>` 回遮罩值；grep 確認 repo 內無明文。
- **Boundaries**：不觸碰既有 `OPS_PROXY_SHARED_SECRET`／Supabase 既有 key；不在此任務內把密鑰寫進 prod 服務(那是 Task 9 的部署步驟)。

## Task 6: Portal 端 handoff 核發 — dispatch to `fullstack-engineer` — **STOP(身分核發，auth 類別)**
- **Goal**：launcher「開啟 HCI-30」動作核發 Task 1(A) 選定格式的簽章 handoff，導向 `hci.aware-wave.com`。
- **Scope**：`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/portal/launcher/page.tsx`、新的核發 route(如 `app/portal/api/hci-handoff/route.ts`，實際命名依 Task 1 決策)。
- **Input**：Task 1(A) 決策、Task 5 簽章金鑰、`lib/tenant-guard.ts:146-154`(`requireClientOrg()`——核發前必須先過此關，不得對非 client 身分核發)。
- **Output**：短效、單次可兌換的 handoff artifact；核發前檢查 `external_tenant_id IS NOT NULL`(未 provisioned 不得核發)。
- **Acceptance**：非 client 身分呼叫此 route → 403(`requireClientOrg()` 擋下)；`external_tenant_id` 為 NULL → 明確錯誤，不核發。
- **Boundaries**：不得核發長效 token；不得把 HCI 的 tenant_id 以外的 portal 內部資料塞進 handoff payload。

## Task 7: HCI 端真實 auth 層(兌換 handoff + per-request role binding) — dispatch to `fullstack-engineer` — **STOP(本計畫核心 auth 變更)**
- **Goal**：新增 handoff 兌換 endpoint 建立 HCI 自己的 session，並用該 session 解析出的 `tenant_id` 取代 `?tenant=a|b`，對每個 `/hci/v1/*` 請求做 `SET ROLE`；移除 `TENANT_ROLES`/`TENANT_IDS` 寫死 map。
- **Scope**：`Projects/internal/hci30/app/server.mjs`(全面重構 `resolveTenant()`)、新增 session/auth middleware 檔案。
- **Input**：Task 1(A) 決策、Task 3 建立的 role 綁定、Task 5 簽章金鑰、Task 6 的 handoff 格式。
- **Output**：兌換 endpoint、session 驗證中介層、`queryAsTenant()` 改吃 session 解析出的 role 而非 query param。
- **Acceptance**：無有效 session 的請求 → 401，不 fallback 任何預設 tenant；`?tenant=a|b` 參數即使存在也不再有作用(不得留隱藏後門)；同一使用者兩次請求解析到同一 tenant，不同使用者解析到不同 tenant。
- **Boundaries**：不得保留 `?tenant=` 作為任何身分來源(含 debug/開發模式——若要保留本機開發捷徑，必須是與 prod 邏輯分支明確隔離、且不可能在 prod 環境變數下被觸發的路徑)；不修改 `hci.current_tenant_id()` 本身。

## Task 8: TENANT-ADAPTER-NEG-01..03 真實執行 — dispatch to `fullstack-engineer`
- **Goal**：跑通 `HCI_WAVE1_NEGATIVE_TEST_SPEC.md:12-14` 三個案例，關閉 ADR-0009 gate 3。
- **Scope**：`Projects/internal/hci30/tests/`(新增對應測試)。
- **Input**：Task 3、Task 7 已部署到可測環境(staging 或本機真實跑通兩支服務)。
- **Output**：三個案例的真實測試(非模擬 harness——`ADR-0009-...md:85-89` 明講「testing a strawman harness...not the real adapter behavior」是要避免的錯法)。
- **Acceptance**：NEG-01 跨 tenant 讀取被拒且不洩漏存在性；NEG-02 綁定他人 external_tenant_id 被拒；NEG-03 訂閱為 NULL/canceled/product_key 不符時 launcher/provisioning 路徑正確回應未 provisioned，不得合成假 tenant。
- **Boundaries**：不得為了讓測試通過而放寬 Task 3/7 的 fail-closed 邏輯。

## Task 9: HCI-30 首次 production 部署 — dispatch to `devops-engineer` — **STOP(prod deploy)**
- **Goal**：把 Task 3/7 的服務、對應 Postgres、`hci.aware-wave.com` DNS/nginx/cert、`api.aware-wave.com/hci/v1/*` gateway route 全部落地到 `ks-aw-01`。
- **Scope**：`ks-aw-01` 上新 container/compose、nginx vhost(走 `/root/lobster-phase1/scripts/safe-infra-patch.sh`)、`lobster-factory/infra/hetzner-phase1-core/apps/node-api/src/index.js`(若選擇 Express 層路由)或 nginx location block(若選擇純路由層)、`/root/lobster-phase1/scripts/sg-deploy.sh` 新增此服務的 6 項清單(test gate/healthcheck/smoke/rollback/notification/typecheck)。
- **Input**：Task 8 通過、Task 5 密鑰、R3(先查 `ks-aw-01` 現有 memory/disk headroom，決定新 Postgres 是獨立 container 還是共用既有 Postgres instance 開新 database)。
- **Output**：`docs`/`trust` 子網域上線時的同款流程(CF A record + nginx vhost + cert SAN，`PRODUCT_DOMAIN_IA_PLAN.md:39` 附近既有先例可抄)、`AWAREWAVE_STACK_QUICKREF.md` 更新。
- **Acceptance**：`sg-deploy.sh` 4/4 smoke 通過無 rollback；`curl https://hci.aware-wave.com` 與 `curl https://api.aware-wave.com/hci/v1/...` 皆回應預期；gateway 設定 grep 不含 HCI 業務詞彙(R4)。
- **Boundaries**：不得修改 `api.aware-wave.com` 既有其他路由；不得繞過 `sg-deploy.sh` 直接 `git pull` 上 prod(AGENTS §0 硬性規定)。

## Task 10: 監控/可觀測性補完 — dispatch to `devops-engineer`
- **Goal**：新服務納入既有監控面(Uptime Kuma、SG endpoint-alert)。
- **Scope**：Uptime Kuma 監控項、`agency-os/docs/operations/MONITORING_SYSTEMS_INVENTORY.md`。
- **Input**：Task 9 完成後的實際服務端點。
- **Output**：`hci.aware-wave.com`／`api.aware-wave.com/hci/v1/health`(若無則需 Task 3/7 補一個)public reachability 探測項；inventory 文件更新一行。
- **Acceptance**：`/health` 100%(AGENTS §7 DoD 表：Infrastructure 類)。
- **Boundaries**：不建新告警管線，沿用既有 SG endpoint-alert + Uptime Kuma 分工(AGENTS §0)。

## Task 11: 全鏈路深度覆審 — dispatch to `critic`
- **Goal**：對 Task 3、4、6、7(provisioning + handoff + auth 層)做 auth/個資類別的全面獨立重新推導(非抽查)——HCI-30 本質是辨人/調查產品，涉個資，符合 AGENTS §4「真碰 auth／crypto／個資／金流」門檻。
- **Scope**：Task 3/4/6/7 產出的全部程式碼變更。
- **Input**：Task 1 決策記錄(作為「設計意圖」對照基準)、`HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md` 全文。
- **Output**：覆審報告，含 R1/R7/R8 的逐項驗證結果。
- **Acceptance**：每個 claim(idempotent、fail-closed、role 綁定正確、handoff 單次有效)都有對應的真實測試或 mutation 證據，不接受「看起來對」。
- **Boundaries**：不覆審 Task 9/10(部署/監控走一般 pre-deploy review 即可，非本次深度覆審對象)。

## Task 12: 文件收尾 — dispatch to `fullstack-engineer`
- **Goal**：把已落地的決策/實作寫回治理文件，關閉相關 OPEN 標記。
- **Scope**：`Projects/internal/hci30/packages/contracts/tenant-context/TENANT_CONTEXT_STANDARD.md`(視 Task 1/3/7 結果關閉 `actor_id`/`service_account_id`/`request_id` 等欄位)、`api/API_CONTRACT_STANDARD.md`(Auth scopes 由 PARTIAL 視進度更新)、`agency-os/docs/edge-and-domains/PRODUCT_DOMAIN_IA_PLAN.md` §1/§3(hci 狀態列)、`agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0009-...md`(補 Implementation note 關閉 gate 3)、`Projects/internal/hci30/docs/HCI_C1_C10_DECISIONS.md`(C6 狀態改 DONE)、`agency-os/TASKS.md`、`agency-os/WORKLOG.md`。
- **Input**：Task 1-11 全部完成。
- **Output**：上述文件更新；若新增 ADR 檔案需跑 `scripts/register-new-governance-doc.ps1`。
- **Acceptance**：`scripts/check-governance-docs-drift.ps1` 無新增 drift；`agency-os/docs/CHANGE_IMPACT_MATRIX.md` 若需要同步更新。
- **Boundaries**：只記錄已發生的事，不得在文件裡宣告尚未真跑的測試已通過(R4/VBC)。

## Execution Order

- **Parallel(第一批，Task 1 完成後)**：Task 2(審查)先於 Task 3；Task 5 可與 Task 2/3 平行(一旦 Task 1 定案機制型態即可動工)。
- **Parallel(第二批)**：Task 4 與 Task 6，皆在 Task 3 契約凍結 + Task 5 密鑰到位後平行開工。
- **Sequential**：Task 7 需 Task 1(A)+Task 3(role 已存在)+Task 5+Task 6(handoff 格式) → Task 8(需 3+7) → Task 11(需 3/4/6/7 全部程式碼完成) → Task 9(需 11 通過 + STOP go-ahead) → Task 10(緊接 9) → Task 12(收尾，需全部完成)。
- **Critical path**：1 → 2 → 3 → 7 → 8 → 11 → 9 → 12。

## Rollback Plan

- Task 3/7 若上線後發現 role 綁定或 session 驗證有漏洞：立即撤銷該服務的公開路由(回到 `sg-deploy.sh` 自動 rollback 機制，Task 9 已內建)，HCI 端 `external_tenant_id` 欄位不做任何刪除——依 ADR-0009 Consequences(`:36`)「rollback 需照 approved migration plan，不得就地改寫 tenant 歸屬」。
- Task 6 handoff 機制若被判定不安全：撤銷 Task 5 簽章金鑰即讓所有既發 handoff 立即失效(前提 Task 1(A) 選型時已把「可立即撤銷」列為驗收條件之一，執行時應補這項)。
- Task 4 provisioning 呼叫失敗：`external_tenant_id` 維持 NULL，launcher 維持 `coming_soon`，無需回滾(設計本身即 fail-closed)。

## Done Criteria

- [ ] Task 1 決策記錄經操作者確認
- [ ] 每個 STOP 任務(3、5、6、7、9)個別取得操作者明確 go-ahead
- [ ] Task 11 critic 深度覆審通過
- [ ] Task 8 三個負向測試真實通過
- [ ] Task 12 文件收尾完成，C6 狀態改 DONE
- [ ] 已知債務：若 Task 1(B) 結論需推翻 `hci.current_tenant_id()` CLOSED 機制，另開新 ADR + 破壞性 migration 任務，不在本計畫範圍內完成

## 相關檔案路徑

- `Projects/internal/hci30/docs/HCI_C1_C10_DECISIONS.md`
- `Projects/internal/hci30/app/server.mjs`
- `Projects/internal/hci30/api/API_CONTRACT_STANDARD.md`
- `Projects/internal/hci30/database/migrations/0001_wave1_synthetic_up.sql`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/ADR-0009-tenant-organization-model-reconciliation.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/wave1/HCI_TENANT_ORGANIZATION_ADAPTER_CONTRACT.md`
- `agency-os/docs/HCI/HCI_AI_LEGO_Blueprint_v2/governance/wave1/HCI_WAVE1_NEGATIVE_TEST_SPEC.md`
- `lobster-factory/packages/db/migrations/0062_organization_product_subscriptions.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/middleware.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/tenant-guard.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/supabase/ssr.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/node-api/src/index.js`
- `agency-os/docs/edge-and-domains/PRODUCT_DOMAIN_IA_PLAN.md`
