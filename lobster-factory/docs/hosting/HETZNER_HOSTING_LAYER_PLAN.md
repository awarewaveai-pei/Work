# Hetzner Hosting Layer — 實作計畫（PLAN / 準則手冊草案）

> **檔案說明**：本檔是「客戶一鍵租 Hetzner 主機 + day-1 硬化 + 交付」的**實作計畫與架構決策**。
> 原檔名 `groovy-orbiting-narwhal.md` 是 plan-mode 自動產生的隨機代號（無意義），已改此名。
> **最終正式手冊落點**（實作批准後建立）：`lobster-factory/docs/hosting/`（依 V2 §31 拆分），本檔不是最終 SSOT，是通往它的計畫。

---

## Context（為什麼）

目標：把「新客戶一鍵架站」做成可重複、零事故、30 年可維護的 SOP 系統。客戶選方案 → 自動租 Hetzner 主機 → day-1 安全硬化 → staging→QA→approval→launch 交付。

**三層知識來源（互補，全部整合）：**
1. **策略政策層** = 使用者提供的 `HETZNER_HOSTING_POLICY_COMPLETE_V2`（v2.1.0，官方源稽核，2597 行）— regions/tiers/RTO-RPO/token/IaC/abuse/compliance/exit。廣。
2. **事故實證戰術層** = 本團隊真實疤痕換來的 19 條硬化基線（挖礦入侵/ClickHouse OOM/502/auto-deploy 連敗/webhook 全斷）— 精確修法 + file:line 證據。深。
3. **既有可復用資產層** = `install-maintenance-crons.sh` / `sync-*.ps1` / `backup-phase1.sh` / `secrets-vault.ps1` / `52-53 auto-reboot.conf` / `wp-install-plugins.ts` ssh2 pattern。

**現況三事實（已盤點驗證）：**
- 「開機」這層不存在（adapter 只到「主機已存在後開 WP 站」）。
- 沒有單一「Hetzner 開機硬化 SOP」（散在 10 runbook + audit + WORKLOG）。
- 一鍵架站骨幹 9 Major + 11 Minor open gaps（M9 孤兒站無 rollback 最致命）。

> 並行風險：另一 AI 在改 app.aware-wave.com（範圍未知，可能照 V2 §30 pack 建 hosting layer — 未確認）。核心 `packages/workflows` 與 UI 解耦可並行，但需 baseline + 紅線。

---

## 現況分析（已親自實讀驗證，file:line — 不臆測）

### 已確認修復（VBC 驗證，不重工）
- **C1** approval gate ✅ `dispatch-action-run.ts:38-40`（ActionRunSchema 含 approval_required/status）、`:190`（PostgREST filter `or=(approval_required.eq.false,approval_status.eq.approved)`）、`:99-109`（dispatchRun guard）
- **C3** SSRF ✅ `create-wp-site.ts:55-78`（noSsrfUrl）、`:82-87`（所有 integration URL 用 ssrfSafeUrl）
- **M6** manifestPath allowlist ✅ `apply-manifest.ts:39-45`、`:122-125`
- **M8** slug/wpPath regex ✅ `wp-install-plugins.ts:29-37`

### 確認仍 OPEN（精確行號 = D2 修復目標）
- **M10** `dispatch-action-run.ts:134-153` — mark-running→trigger→mark-dispatched 三段非原子，trigger 成功但 mark-dispatched 失敗 → 卡 running + trigger_run_id 遺失
- **M9** `orchestrate-tenant-provisioning.ts:83-115` — for loop 內 webhook 無 try-catch，第 N 個 502 → 後續 provider 完全不跑、無補償
- **M7** `installManifestStaging.ts:99-106` — `spawn(..., { env: { ...process.env, DRY_RUN } })` 繼承全部 secrets
- **M3** `wp-install-plugins.ts:191-226` — dry-run 強設 `pluginStatus="installed"` → DB `status="completed"`（虛假）

### 整合點與型別現況（D3 設計依據）
- **插入點確認**：`create-wp-site.ts:136` 呼叫 `resolveStagingProvisioning()`，**之前無機層**，可直接插入。blocked 分支 `:142-182`（status="blocked" + DB writes disabled）= 機層 blocked 的鏡像範本。
- **型別不一致（須先修）**：`resolveStagingProvisioning` 回 `{outcome:"blocked"}`（types.ts:26-35）但 `StagingProvisionAdapter` 契約回 `{blocked:true}`（stagingProvisionContract.ts:14-19）。**新 adapter 不可沿用矛盾，統一用 `outcome:` discriminant。**
- **M1/M2 精確解**：`MockStagingSiteRef`/`VendorStagingSiteRef`（types.ts:4-21）無 `sshHost?` → `create-wp-site.ts:269,309` 才 fallback `TODO_from_staging_ref`。加 optional `sshHost?` 即消除（additive，向後相容）。InputSchema 已有 sshHost/sshCredentialsRef/wpPath（`:104-106`）。stagingRef 選擇三元 `:184-185` 需加機層 outcome 分支。
- **env-gate 慣例確認**：LOBSTER_HOSTING_ADAPTER(default none) / LOBSTER_ENABLE_DB_WRITES(`:209-211`) / LOBSTER_EXECUTE_MANIFEST_STEPS(`:368-369`) / LOBSTER_SSH_KEY_<REF>(`wp-install-plugins.ts:52-57`)。`LOBSTER_SERVER_ADAPTER` 鏡像之。
- **approval gate 現成**：`build/runs/route.ts:147-148`（approval_required/status 寫入）、`:114-132`（site_run_already_active 冪等 409）、`contracts.ts:282-453`（Profile A/B `approvalRequired=(env===production)`、Profile C 恆 true、全部 productionDeployAllowed=false）。serverPlan 接此機制即可。

### Vault / 既有資產現況（D3/D4 可用性）
- 🔴 **`HETZNER_API_TOKEN` 為空**（`mcp/user-env.ps1:14`）— Phase 3 真機開機**硬前提**，需一次性手動填（Hetzner dashboard → Security → API tokens）。`HETZNER_API_BASE_URL` 已有（`:12`）。
- ✅ `CLOUDFLARE_API_TOKEN` 有效（`:8`）+ Zone ID `f21b1919632fee2221647908a94fdcac` → DNS 自動化 creds 備齊（但 repo **無 DNS record helper**，需新建）。
- ✅ `RESEND_API_KEY` 有效（`:5`）→ SMTP 共用 pool 可立即用，friction #3 creds 解決。
- ✅ `secrets-vault.ps1 -Action get -Name <KEY>`（確認旗標是 `-Name` 非 `-Key`）。⚠️ 該指令輸出為**遮罩值**，僅供確認存在；真值取自本機 `mcp\user-env.ps1`。
- ⚠️ `install-maintenance-crons.sh` 冪等 + host 偵測，但**靠 hostname 比對 sg/eu**（`:35-43`）；`backup-phase1.sh` **寫死容器名** `lobster-wordpress-db`/`lobster-wordpress`（`:55,75`）→ 新租戶要復用，須**沿用同套容器命名**（見 D3 決策 3）。

---

## 架構決策（R0，已分析，待使用者批准才實作）

### 決策 0 — 交付模型：腳本 SSOT + 雙觸發（先 AI、後按鈕），**不用 Trigger.dev 主體**（最高層決策）
- **任務理解**：provisioning 的「程序」該活在哪、由誰觸發。使用者願景 = app.aware-wave.com 點按鈕自動處理；但現階段「Claude/指令觸發」更省力。
- **現況分析**：既有 Trigger.dev provisioning（create-wp-site 等）**env-gate 全 OFF = 搭好未上線**。使用者規模 = 代理商偶發接客（operator-in-loop），非客戶自助高頻。已有 `hetzner-ssh` MCP + Hetzner API token 能力。
- **關鍵真相**：網頁按鈕只能呼叫**部署好的後端 code**，**無法召喚對話中的 Claude**。「點按鈕自動處理」⇒ 邏輯必須在 code 裡。「Claude 幫我做」⇒ 對話觸發，非按鈕。
- **30 年紅線**：程序必須**寫死在 code（可測/冪等/rollback）**，**禁止 AI 每次即興**（即興 = 重複開機+孤兒站+不可稽核，違反可驗證可回滾）。
- **建議方案**：**程序 = 一支冪等+可回滾的 provisioning CLI/腳本（SSOT），復用既有 building-block 函式（resolveStagingProvisioning / runAllIntegrations / wp-install 等，非重寫）。觸發方式可換、與程序解耦：**
  - **Phase 1（現在，最省力）**：`/provision-client <slug>` Slash Command（或 devops-engineer agent）呼叫 CLI。不碰 next-admin、不碰 Trigger.dev。
  - **Phase 2（要按鈕時）**：app.aware-wave.com 按鈕 → next-admin API route → 呼叫**同一支 CLI**。零重寫。
  - **Trigger.dev**：⏸️ 不用（規模不需常駐編排）；未來客戶自助上量再把同一支 CLI 包成 Trigger task。
- **為何最佳**：投資在「腳本」（一次寫好），觸發先 AI 後按鈕無痛升級；不重工（復用既有函式）、不雙編排（不碰 n8n/Trigger.dev）、最小爆炸半徑、30 年可維護。
- **rollback**：CLI 階段化 try/catch + teardown（DELETE server + DELETE primary_ip）；整功能未啟用前對現有系統零影響。

### 決策 1 — 模組結構：演化現有，不建 `packages/hosting`
- **任務理解**：V2 §29 提廣義 `HostingAdapter`，但現有 `packages/workflows/src/hosting/` 已有 `StagingProvisionAdapter`。
- **現況分析**：`resolveStagingProvisioning.ts` + `stagingProvisionContract.ts` + mock/http_json/provider_stub adapters 已運作；`create-wp-site.ts` 是唯一 caller。
- **風險**：另建 `packages/hosting` = 兩套抽象並存（R0 禁重複模組）+ 橋接成本 + 維護分叉。
- **建議方案**：在 `packages/workflows/src/hosting/` 內升級成廣義 `HostingAdapter`（createServer/createStaging/createSnapshot/restoreSnapshot/getHealth/listResources/estimateCost）；現有 `StagingProvisionAdapter` 降為 `createStaging` 的內部實作（向後相容）。新增 `providers/hetzner/{HetznerHostingAdapter,policy,labels,cost,types}.ts`。
- **rollback**：純 additive + 介面擴充；env gate `none` 即回現況。

### 決策 2 — IaC：Hybrid（OpenTofu 管靜態 / imperative 管動態）
- **現況分析**：既有 provisioning 全 imperative（Trigger.dev）；無 Terraform/state；`/check-drift` 只管 deploy commit。
- **風險**：全 Terraform = state backend 負擔 + 不合每客戶動態 apply；全 imperative = 無 infra drift 偵測。
- **建議方案**：
  - 靜態共用基盤（Cloud Firewall 模板 / Network / Project / firewall rules / floating IP）→ **OpenTofu** + 加密遠端 state（複用 Supabase/R2）。
  - per-租戶動態（createServer + cloud-init + snapshot + 交付）→ **imperative HetznerHostingAdapter**。
- **rollback**：OpenTofu 只管靜態資源，`tofu destroy` 範圍可控；動態層走 env gate。

---

## 交付物（整合 V2 後，6 塊）

| # | 交付物 | 性質 | 來源 |
|---|--------|------|------|
| D1 | **Hetzner 架站硬化 SOP**（19 條戰術 + 機制對照 + open-gaps register） | 文件 | 戰術層 |
| D2 | **致命 open gaps 修復**（M9/M7/M10/M3/M1-2） | 改 code | 戰術層 |
| D3 | **HostingAdapter 升級 + HetznerHostingAdapter**（imperative 動態層） | 開新 code | V2+既有 |
| D4 | **OpenTofu 靜態基盤**（Cloud Firewall / Network / token 範本） | 開新 IaC | V2 |
| D5 | **V2 政策手冊入庫 + 拆分**（docs/hosting/ 依 §31） | 文件 | V2 |
| D6 | **客戶分層 → 自動化映射**（tier→serverType/region/backup/RTO-RPO） | code+doc | V2 |

---

## D1 — Hetzner 架站硬化 SOP（戰術層 19 條）

**新建**：`lobster-factory/docs/hosting/HETZNER_PROVISIONING_HARDENING_SOP.md`（D3 驗收 SSOT，每條附事故 file:line）

**A. 安全（挖礦 2026-04-20）**：1 無預設密碼 / 2 DB port 127.0.0.1 綁定 / 3 **DOCKER-USER chain 雙層**（UFW 對 Docker 無效）/ 4 iptables INPUT DROP / 5 SSH key-only
**B. OOM（ClickHouse/502）**：6 容器 mem_limit + 服務內上限 / 7 log 表 TTL / 8 swap+告警
**C. Nginx 限速（scanner flood）**：9 limit_req_zone 必加 limit_req / 10 scanner-block.inc 獨立 log / 11 不留 stock default
**D. TLS（certbot 壞）**：12 DNS-01（Cloudflare API）非 HTTP-01 / 13 renew --dry-run 實測
**E. 部署（連敗 36h）**：14 build artifact 不進 git / 15 rsync 非 git pull / 16 deploy test+health+smoke+rollback
**F. DB（webhook 全斷）**：17 migration 後 NOTIFY pgrst reload schema
**G. 維運/逃生**：18 unattended auto-reboot stagger / 19 Hetzner API token+server ID 逃生（rescue/VNC base64）

含坑→機制對照表（commands/agents/hooks/scripts/routines/runbooks 全盤點，已完成）。

---

## D2 — 致命 Open-Gaps 修復（先穩骨幹）

`lobster-factory/packages/workflows/src/`，按致命度（行號已實讀驗證）：
- **M9** `orchestrate-tenant-provisioning.ts:83-115` — for loop 內 webhook 無 try-catch → 一個 502 中斷整圈、後續 provider 不跑。修：每 provider webhook 包 try-catch（失敗只記錄不 short-circuit）+ 階段化 compensating rollback（失敗的已開資源標記/銷毀，secretRef 進 error detail）。**最致命**。
- **M7** `installManifestStaging.ts:99-106` — `spawn(..., { env: { ...process.env }})` 繼承全部 secrets。修：env allowlist（只傳 PATH/HOME/DRY_RUN + 該腳本明確需要的）。
- **M10** `dispatch-action-run.ts:134-153` — mark-running→trigger→mark-dispatched 非原子。修：原子條件 update（trigger 後 mark-dispatched 用 `.eq("status","running")` 條件；失敗補償標記）。**db-expert 先審**。
- **M3** `wp-install-plugins.ts:191-226` — dry-run 強設 `pluginStatus="installed"` → DB `status="completed"`。修：dry-run 寫獨立 `status`/`mode`（如 `dry_run_simulated`），不偽報 completed。
- **M1/M2** `create-wp-site.ts:269,309` `TODO_from_staging_ref` → 隨 D3.0（ref 型別加 `sshHost?`）+ 機層產真值消除（同 PR）。

---

## D3 — HostingAdapter 升級 + HetznerHostingAdapter（動態層）

### D3.0 前置（型別統一，最小改動，先做）
- `types.ts`：`MockStagingSiteRef`/`VendorStagingSiteRef` 加 `sshHost?: string`、`ipv4?: string`（additive optional，不破壞既有 callers）→ 消除 M1/M2 的 fallback。
- 統一 blocked 形狀：`StagingProvisionAdapter` 契約改回 `{ outcome: "blocked", ... }`（移除 `blocked: true`），與 `resolveStagingProvisioning` union 一致。**影響面**：僅 hosting/ 內部 + 1 caller（create-wp-site.ts），grep 確認無其他 consumer。rollback：revert 該 commit。
- `create-wp-site.ts:184-185` stagingRef 三元加機層 outcome 分支。

### 決策 3 — 租戶容器命名標準化（讓既有 backup/cron 腳本零修改復用）
- **現況**：`backup-phase1.sh:55,75` 寫死 `lobster-wordpress-db`/`lobster-wordpress`；`install-maintenance-crons.sh:35-43` 靠 hostname 比對。
- **風險**：新租戶容器名不同 → backup 腳本失效（silent）。改腳本 = 動到 production 既有資產（risk）。
- **建議**：新租戶 cloud-init 渲染的 docker-compose **沿用同套容器命名 + `--host` 明確傳入**，腳本原封不動復用（不改 production 腳本 = 最小爆炸半徑）。若未來需多站/機，再參數化容器名（env-driven），列為 backlog 不在本期。

### 架構（依決策 0 + 1）
**程序核心 = provisioning CLI 編排器**，復用既有 building-block 函式（非重寫），與觸發解耦：
- **`packages/workflows/src/provision/provisionClient.ts`（新，SSOT 編排器）**：依序呼叫 building blocks（resolveServerProvisioning → cloud-init/post-boot → cloudflare DNS → resolveStagingProvisioning → runAllIntegrations → SMTP → QA），內建冪等（label 查重）+ 階段化 rollback（teardown: DELETE server+primary_ip）+ billable 步驟 approval-pause。**這支是 30 年 SSOT。**
- **CLI entry `packages/workflows/src/provision/cli.ts`（新）**：薄 wrapper 解析參數 → 呼叫 `provisionClient()`。供 Slash Command（Phase 1）與 next-admin API route（Phase 2）共用。
- building blocks（升級 `packages/workflows/src/hosting/`，演化現有不建 packages/hosting）：
  - `HostingAdapter` 廣義介面（createServer/createStaging/createSnapshot/restoreSnapshot/deleteEnvironment/getHealth/listResources/estimateCost）— V2 §29；現有 `StagingProvisionAdapter` 成為 createStaging 內部實作。
  - `providers/hetzner/HetznerHostingAdapter.ts`（主檔）+ `policy.ts`（prod-delete/rebuild block）+ `labels.ts` + `cost.ts` + `types.ts`
  - `providers/cloudflare/dns.ts`（**新**：A-record 建/更新/刪 idempotent；複用 `CLOUDFLARE_API_TOKEN` + Zone ID `f21b1919632fee2221647908a94fdcac`）— friction #1 本體。
  - `resolveServerProvisioning.ts`（機層進入點，鏡像 resolveStagingProvisioning env-gate）
  - `ssrf.ts`（抽 create-wp-site.ts:55-78 共用）
  - cloud-init `infra/hetzner-provision/cloud-init/day1-hardening.yaml.tmpl` + `post-boot-bootstrap.sh`
- **觸發層（依決策 0，可換、與核心解耦）**：
  - Phase 1：Slash Command `.claude/commands/provision-client.md`（呼叫 CLI）。不碰 next-admin。
  - Phase 2：next-admin 按鈕 → `app/api/provision/route.ts`（**新**，呼叫同一 CLI/核心 + 既有 approval gate）。
- **既有 `trigger/create-wp-site.ts` Trigger task**：維持 dormant/gated 不動；D3.0 的 `create-wp-site:184-185` 三元改為**選做**（CLI 為主路徑時非必要）。

### V2 補充併入（原計畫缺的 8 個自動化設計）
1. **區域**：客戶交付站固定開 `sin`（Singapore）；控制平面留 `hel1`（Finland）。**public runtime 禁同步依賴 Finland**（checkout/login/cart）。input schema region enum 預設 sin。
2. **Token 隔離（官方查證修正）**：Hetzner token **無 per-action 細粒度**，只有 project 層 Read/Read+Write 且綁單一 project。→ 正解：**staging / production 各開一個 Hetzner Cloud project**，各自一個 Read+Write token（`HETZNER_STAGING_TOKEN`/`HETZNER_PROD_TOKEN`）。staging token 因綁 staging project 物理上碰不到 production。agent 只給 staging token。「不可刪 production」靠 project 隔離 + `policy.ts` 軟封鎖（非 token 權限）。break-glass = prod token 存 emergency store，用需 approval+incident_id。
3. **Hetzner Cloud Firewall**（provider 層 allowlist）= 第二道，createServer 時 attach（D4 OpenTofu 管 firewall 範本）+ cloud-init iptables 第一道。
4. **SMTP（官方查證修正）**：Hetzner 預設封鎖 **outbound 25/465**（解封需 ≥1 月帳齡+付款+開 ticket）。Resend 官方 SMTP 用 465 → **在 Hetzner 上必須改 port 587**（host `smtp.resend.com`、user 字面 `resend`、pass=API key、587/STARTTLS）。FluentSMTP「Other SMTP」填入。**禁 local sendmail**。SPF/DKIM/DMARC 必設。
5. **帳務防呆**：關機仍計費 → staging retention（preview 7d / staging 30d 刪）；unused Primary IP/Volume/Snapshot 週清；新帳號不 day-1 大量開機。
6. **Backup 現實**：Hetzner backup 不含 volume+綁 server → offsite 強制（R2/Storage Box）+ **pre-deploy/pre-update snapshot** 為 workflow 步驟。
7. **Labels+命名**：`lf-{env}-{region}-{org}-{site}-{role}-{nn}` + 12 必填 label（org/workspace/project/site/env/plane/region/cost_center/owner/managed_by/provisioned_by/created_by_run_id）。
8. **Deletion protection**：prod server 開 `deletion_protection` + policy.ts 封鎖 prod delete/rebuild（agent 不可）。

### 歷史教訓 gate（不變）
C1 billable→approval（route.ts+contracts.ts 強制）/ C2 idempotency（label 查重→reused）/ M7 不繼承 env / M9 rollback / 挖礦 day-1 硬化。

### Env gate（雙層保險）
`LOBSTER_SERVER_ADAPTER`(預設 none) + `LOBSTER_SERVER_PROVISION_ENABLED`(預設 OFF→dry-run 不花錢)。

### 復用既有資產
install-maintenance-crons.sh / backup-phase1.sh / verify-backup.sh / endpoint-alert.sh / sync-*.ps1 / secrets-vault.ps1 / 52-53 auto-reboot.conf / wp-install-plugins.ts ssh2。

---

## D4 — OpenTofu 靜態基盤（依決策 2）

**新建**：`infra/hetzner/opentofu/`
- `main.tf`（hcloud provider + 加密遠端 state）
- `firewall.tf`（Cloud Firewall allowlist：22 限 allowlist IP/VPN、80/443 public/Cloudflare；對齊 V2 §F.4）
- `network.tf`（Private Network，DB/redis 私網）
- `variables.tf`（token via env，sensitive）
管靜態、改動少、review-before-apply、可 drift 偵測。**不**管 per-租戶動態 server（那走 D3 adapter）。

---

## D5 — V2 政策手冊入庫 + 拆分

V2 是官方源稽核的策略 SSOT，入庫並依 §31 拆分：
`lobster-factory/docs/hosting/`：HETZNER_HOSTING_POLICY_COMPLETE_V2.md（主）/ HETZNER_RENTAL_CHECKLIST.md / HETZNER_PRODUCTION_POLICY_V2.yaml / HETZNER_BACKUP_RESTORE_RUNBOOK.md / HETZNER_INCIDENT_RUNBOOK.md / HETZNER_ABUSE_NOTICE_RUNBOOK.md / HETZNER_EXIT_PLAN.md / CLIENT_HOSTING_TIERS.md / WORDPRESS_UPDATE_POLICY.md / PERFORMANCE_BUDGET.md / HOSTING_CONTRACT_ADDENDUM.md
D1 戰術 SOP 與 V2 主檔互相 cross-ref（深度補廣度）。註冊治理文件（register-new-governance-doc.ps1）。

> 待補（V2 §33 最後 5%，需實測）：台灣各 ISP→sin latency/throughput、Woo checkout 壓測、restore time、每站成本。列為 field-test backlog。

---

## D6 — 客戶分層 → 自動化映射

V2 §4 tiers 轉成 input schema + provisioning 參數：
| tier | isolation | serverType | region | backup | RTO/RPO |
|------|-----------|-----------|--------|--------|---------|
| starter | shared (5-10 sites) | cpx11 (2vCPU/2GB) | sin | daily+offsite | 24h/24h |
| business | dedicated/client | cpx21 (3vCPU/4GB) | sin | daily+pre-deploy snap | 8h/24h |
| commerce | dedicated | cpx31 (4vCPU/8GB) | sin | db+content daily+snap | 4h/6-24h |
| premium | dedicated/managed | cpx41+ (8vCPU/16GB)/外部 | sin | daily+/offsite | 1-4h/1-6h |

> ⚠️ **server type 修正（官方查證）**：cx22/cx32/cx42/cx52（Intel Gen2）**2026-01-01 起停售**。Singapore 只保證 **AMD（cpx 系列）** 可用（cx Gen3 在 SIN 不確定、ARM cax 歐洲限定）。**實作時必須 runtime `GET /v1/server_types?location=sin` 確認可用機型**，不可硬編。上表 cpx 為建議起點。
「客戶選方案」= 選 tier → 自動帶出 serverType/region/backup/RTO-RPO + production launch gate（14 項 checklist V2 §19）。

---

## 順暢無阻：端到端 flow 與剩餘 friction 消除

**完整 happy path（一鍵）**：
客戶選 tier → 開機(sin) → cloud-init day-1 硬化 → post-boot(crons/sync/SMTP) → **Cloudflare DNS A-record 指向新 IP** → DNS-01 cert → WP install + wc-core manifest → integrations(Sentry/Uptime/n8n/PostHog) → QA smoke → **production launch gate(1 次人工 approve)** → 交付。

**「順暢」的定義校準（誠實）**：
- **Staging 全自動無阻** — 從選方案到 staging 站可瀏覽，零人工。
- **Production launch 保留 1 個人工 approve** — 這是 V2 §19 + C1 教訓的**安全設計，不是缺陷**（billable + 不可逆 + 金流）。「無阻」指流程無卡頓/無孤兒/可重試，不是「無人核可」。
- 讓它真正順的底層 = **M9 rollback（失敗不留孤兒）+ C2 idempotent（重送回 reused 不重複計費）+ env gate dry-run** — 這三個是「順暢無阻」的工程本體，已在 D2/D3。

**為達端到端順暢，需補的 3 個 friction（原計畫未明確）**：
1. **Cloudflare DNS 自動化**：開機後自動建 A-record（新 server IP，proxied）。原計畫只有 DNS-01 cert，**沒有指向網站的 A-record**。→ 新增 `providers/cloudflare/dns.ts`。**creds 已備**（CLOUDFLARE_API_TOKEN 有效 + Zone ID 已知），只缺 helper 程式。無此步 = 站開好但網址不通 = 卡。
2. **Domain 來源決策**：客戶自帶網域 vs 我方子網域。→ 建議：staging/preview 一律 `<slug>.aware-wave.com`（全自動順暢）；正式網域客戶自帶（launch gate 內一次設定）。寫進 D6。
3. **SMTP 憑證**：FluentSMTP 需外部 SMTP key。→ 建議共用 **Resend** pool（`RESEND_API_KEY` 已在 vault 且有效），provisioning 自動帶入，零人工。friction 已大幅降低。

> 補上這 3 個，staging→交付才真正一鍵順暢；正式上線維持 1 個安全 approve。creds 現況：CF ✅ / Resend ✅ / **Hetzner ❌ 空（見前置條件）**。

## 前置條件（Prerequisites，真機 Phase 4 前必備；Phase 0-3 dry-run 不需）

1. 🔴 **建 2 個 Hetzner project + token**（`HETZNER_API_TOKEN` 現空 `mcp/user-env.ps1:14`）— 一次性手動：Hetzner Console 建 **staging project** + **production project**，各建一個 Read+Write token（Hetzner 無細粒度權限，靠 project 隔離）。寫 vault：`secrets-vault.ps1 -Action set -Name HETZNER_STAGING_TOKEN` / `-Name HETZNER_PROD_TOKEN`。**無 token，Phase 4 真機無法進行**（Phase 0-3 dry-run 不受影響）。
2. ✅ Cloudflare token / Zone ID — 已備。
3. ✅ Resend SMTP key — 已備。
4. Hetzner 帳號健康（V2 §3）：確認非新帳號詐騙風險期、付款方式有效、deletion protection 流程。

## 執行順序（30 年紀律，依決策 0 雙觸發）

- **Phase 0**：baseline checkpoint + 紅線給另一 AI + D1 SOP + D5 V2 入庫（純文件，Low risk，立即交付）
- **Phase 1**：D2 修致命 gaps（M9→M7→M10→M3，R0 四動作 + critic，M10 經 db-expert）— 穩既有 building blocks
- **Phase 2**：D3.0 型別統一 → building blocks（HostingAdapter + providers/hetzner + providers/cloudflare/dns + cloud-init）+ **`provisionClient.ts` 編排器 + `cli.ts`** + mock + dry-run + D4 OpenTofu 靜態（Layer 1 純本機驗證，不花錢）
- **Phase 3（觸發 A，最省力）**：`/provision-client` Slash Command 接 CLI → **AI/指令觸發**即可開站。先用 dry-run 跑通整鏈。
- **Phase 4**：真機驗收（**cpx 最小機**開完即銷毀，High risk，需明示 go-ahead）+ D6 tier 映射 + launch gate
- **Phase 5（觸發 B，要按鈕時才做）**：next-admin 加按鈕 + `app/api/provision/route.ts` 呼叫**同一 CLI/核心** → 真自助按鈕。零重寫。**此階段才需協調 UI AI**。
- **Trigger.dev**：本計畫不納入；未來客戶自助大量再評估包裝。

---

## 驗證計畫

- **Layer 1 純本機/CI**：adapter/cloud-init/SSRF/token-選擇/label/idempotency/rollback/cost-estimate 單元測（mock fetch）+ OpenTofu `tofu plan` 驗
- **Layer 2 真機（cpx 最小機即銷毀）**：先 `GET /v1/server_types?location=sin` 確認可用機型；nmap 只見 22/80/443；臨時容器 0.0.0.0:9999 外部 filtered（挖礦迴歸）；無 key SSH 拒；curl 觸發 429/503；DNS-01 cert；SMTP 587 寄信測；auto-reboot 三鍵；cron 存在；day1-hardening.json 全綠
- **Layer 3 冪等/rollback**：同 siteId 回 reused；注入失敗驗無孤兒計費
- 每階段 R0 四動作寫 WORKLOG（REALTEST_EVIDENCE/REVIEW_DONE/BUGHUNT_DONE）

## 風險與 Rollback
- 整功能：`LOBSTER_SERVER_ADAPTER=none` 回現況；新檔 additive
- 孤兒計費：M9 rollback + reaper 掃 orphan-pending 超時刪。**teardown 必須顯式 `DELETE /v1/primary_ips/{id}`**（官方：刪 server 不連帶刪 Primary IP，€0.50/月孤兒費）；backup 隨 server 刪、snapshot 不隨刪（長期保留靠 snapshot）。
- firewall 鎖死：cloud-init 先 ACCEPT 22 再 DROP + Hetzner Console rescue break-glass
- 真機開機 = High risk = 需明示 go-ahead
- 另一 AI 並行：核心（Phase 1-4）與 UI 解耦，**只在 Phase 5（按鈕）才需協調 UI AI**；紅線（UI AI 別碰 packages/workflows / provision 核心 / migrations）+ baseline diff

---

# 附錄 A：Hetzner 官方查證技術規格（AI 執行依據）

> 全部 2026-06-05 查證自官方 docs.hetzner.com / 官方 SDK（hcloud-go, hcloud-python）/ Cloudflare API / certbot 官方。每條可直接照打。**不可憑記憶改這些值。**

## A.1 Create Server — `POST https://api.hetzner.cloud/v1/servers`
Header：`Authorization: Bearer $HETZNER_STAGING_TOKEN`
必填：`name`(RFC1123 唯一) / `server_type`(如 `"cpx21"`) / `image`(如 `"ubuntu-24.04"`)
常用選填：`location`(`"sin"`/`"hel1"`) / `ssh_keys`[] / `user_data`(cloud-init，**≤32KiB**) / `labels`{} / `firewalls`[`{"firewall":{"id":N}}`] / `start_after_create`(預設 true) / `public_net`{enable_ipv4,enable_ipv6}
回應 201：`server.id` / `server.status`(initializing→starting→**running**) / `server.public_net.ipv4.ip` / `server.public_net.ipv4.id`(Primary IP id) / `root_password`(僅未給 ssh_keys 時非 null) / `action.id`
**poll**：`GET /v1/servers/{id}` 等 `status=="running"` 或 `GET /v1/actions/{id}` 等 `status=="success"`
**rate limit**：3600 req/hr/token，超過 429（headers `ratelimit-remaining`/`ratelimit-reset`）

## A.2 Server types（⚠️ 停售修正）
- **停售（2026-01-01 起不可開）**：cx22/cx32/cx42/cx52（Intel Gen2）
- **Singapore 可用 = AMD cpx**：cpx11(2/2/40)/cpx21(3/4/80)/cpx31(4/8/160)/cpx41(8/16/240)/cpx51(16/32/360)
- cx23/33/43/53（Gen3）SIN 可用性不明；cax(ARM) 僅歐洲
- **實作必跑** `GET /v1/server_types?location=sin` 取真實清單，不硬編
- locations：`sin`(Singapore/ap-southeast) / `hel1`(Helsinki/eu-central) / `fsn1`/`nbg1`(DE) / `ash`/`hil`(US)
- images：`ubuntu-24.04` / `ubuntu-22.04`（API 自動選對架構）

## A.3 Token 權限模型（⚠️ 架構修正）
只有 project 層 **Read** 或 **Read+Write**，**無 per-action 細粒度**，token 綁單一 project。
→ staging/production **各開一 project**，各一個 Read+Write token。隔離靠 project 不靠權限。

## A.4 Cloud Firewall — `POST /v1/firewalls`
rule 欄位：`direction`("in"/"out") / `protocol`("tcp"/"udp"/"icmp"/"esp"/"gre") / `port`("22"/"80-85"/"any") / `source_ips`(CIDR 列表，用於 in) / `destination_ips`(CIDR 列表，用於 out) / `description`
- **inbound 隱含 deny-all**（每條 allow 要顯式）
- **outbound 預設全開；一旦加任何 outbound rule → 變全擋**（要列全需要的 outbound）
- apply：create server 帶 `firewalls[]`，或 `POST /v1/firewalls/{id}/actions/apply_to_resources`
- `set_rules` **整批覆蓋**（無 append）；上限 500 effective rules
- **與機內 iptables 獨立兩層**（封包須兩層都過）→ D4 firewall + cloud-init iptables 雙層成立

## A.5 cloud-init / user_data
- 透過 create server `user_data` 字串傳，**≤32KiB**，首行 `#cloud-config`
- modules：users / ssh_authorized_keys / write_files / runcmd / packages / package_update
- 🔴 **machine 上任何 process 免授權可讀**（`http://169.254.169.254/hetzner/v1/userdata`）→ **絕不放機密**
- 驗證：`cloud-init status --wait`（done/error）+ `/var/log/cloud-init-output.log`

## A.6 Backup / Snapshot
- enable backup：`POST /v1/servers/{id}/actions/enable_backup`，7 slots，費用=server 月費 20%
- snapshot：`POST /v1/servers/{id}/actions/create_image` `{type:"snapshot",description,labels}`；€0.0143/GB/月；帳號上限 30 snapshots
- 🔴 backup **綁 server、刪 server 連帶刪**；snapshot **不隨刪**（長期保留靠 snapshot）；**volume 都不含**；running snapshot **不保證一致**（DB 先 dump/quiesce）
- **pre-deploy / pre-plugin-update snapshot 為 workflow 必經步驟**

## A.7 Deletion protection / Delete / Primary IP（⚠️ teardown 修正）
- protection **非 create 時**：`POST /v1/servers/{id}/actions/change_protection` `{delete:true,rebuild:true}`（delete 與 rebuild 須同值）；刪前先設 false
- delete：`DELETE /v1/servers/{id}`（連帶刪 backup，保留 snapshot）
- 🔴 **Primary IPv4 不隨 server 刪**（€0.50/月孤兒）→ teardown 顯式 `DELETE /v1/primary_ips/{id}`
- rescue（逃生）：`POST /v1/servers/{id}/actions/enable_rescue` `{type:"linux64",ssh_keys:[id]}` 回 root_password；**窗口 60 分（從 enable 起算，非 reboot）**

## A.8 SMTP（⚠️ port 修正）
Hetzner 預設封鎖 outbound **25/465**（解封需 ≥1 月帳齡+付款+ console.hetzner.com/limits ticket）；**587 不封**。
→ Resend 改 **587/STARTTLS**：host `smtp.resend.com`、user 字面 `resend`、pass=API key（不可用官方建議的 465）。

## A.9 Terraform/OpenTofu（D4 靜態層）
- provider `hetznercloud/hcloud` v1.64.0（2026-05-28），**OpenTofu 相容**（plugin protocol v6）
- token：env `HCLOUD_TOKEN` 或 `provider "hcloud" { token = var.hcloud_token }`
- `hcloud_server`：name/server_type/image/location/ssh_keys/firewall_ids/user_data(`templatefile`)/labels/`public_net{}`/`backups`/`delete_protection`/`rebuild_protection`
- `hcloud_primary_ip`：`auto_delete`（設 false 避免隨 server 刪壞 state）；`datacenter` 已棄用→用 `location`（2026-07 移除）
- `hcloud_firewall`：rule{direction/protocol/port/source_ips/description}
- remote state = Hetzner Object Storage（S3 相容）或 R2：backend "s3" + `endpoints={s3="https://fsn1.your-objectstorage.com"}` + `region="main"`(忽略) + `use_path_style=true` + `skip_*=true`（Ceph 相容）；creds 走 `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`

## A.10 Cloudflare DNS（friction #1，creds 已備）
- 建 A：`POST /client/v4/zones/{zone_id}/dns_records` `{type:"A",name(FQDN),content(IPv4),proxied,ttl(1=auto)}`
- 冪等：先 `GET .../dns_records?name[exact]=<fqdn>&type=A` → 空則 POST，有則 `PUT .../dns_records/{id}`
- token 權限：Zone:DNS:Edit + Zone:Zone:Read；現有 `CLOUDFLARE_API_TOKEN`，Zone ID `f21b1919632fee2221647908a94fdcac`
- DNS-01 cert：`apt install python3-certbot-dns-cloudflare`；creds `~/.secrets/certbot/cloudflare.ini`(`dns_cloudflare_api_token=...`, chmod 600)；`certbot certonly --dns-cloudflare --dns-cloudflare-credentials <ini> -d <d> -d "*.<d>"`；慢時加 `--dns-cloudflare-propagation-seconds 60`

## A.11 WordPress 硬化（官方）
- nginx 禁 uploads 執行 PHP：`location ~* /(wp-content|wp-includes)/.*\.(php|phps|phtml|phar)$ { deny all; return 403; }`（須對既有 plugin 測試）
- wp-config：`DISALLOW_FILE_EDIT=true`、`FORCE_SSL_ADMIN=true`、`DISABLE_WP_CRON=true`（用系統 cron）；**`DISALLOW_FILE_MODS=true` 會擋 auto-update → 改走 WP-CLI/MainWP**（本團隊已用）
- wc-core stack（V2 §11.3）：Kadence + Kadence Blocks + WooCommerce + CartFlows + Rank Math + FluentCRM + Fluent Forms + FluentSMTP

## A.12 來源
docs.hetzner.com/cloud（servers/firewalls/backups-snapshots/primary-ips/billing FAQ + creating-a-server/firewall）、docs.hetzner.com/cloud/api/getting-started、官方 SDK hcloud-go/hcloud-python、registry.terraform.io/providers/hetznercloud/hcloud、developers.cloudflare.com/api、certbot-dns-cloudflare.readthedocs.io、developer.wordpress.org/.../hardening、resend.com/docs/send-with-wordpress-smtp。（完整 URL 清單已在研究記錄）