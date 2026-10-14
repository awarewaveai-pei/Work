# Client Onboarding Portal — Codebase Map + Reading List

> **狀態**：研究完成（2026-05-30），14 段規格**尚未撰寫**。
> 這份檔的用途：讓任何機器、任何 session 的 Claude「開工就接得回來」，不必重新研究。
> 對應任務：`TASKS.md` → `### 未完成` → `#### 待釐清 / 明日提醒`（onboarding portal 那兩行）。

---

## 0. 下次開工：先讀這幾個檔（ADHD-friendly，照順序，不用記）

> AO-RESUME 第 7 段會自動 inline handoff packet，packet 會指到這份檔。**你不用記任何路徑——開工關鍵字 → 我 `git pull` → 看到 packet → 讀這份 → 接續。**

**第一層（先讀這 3 個，建立全局）**
1. `agency-os/handoffs/2026-05-30-1641-tomo-164100.md` — 最完整的 gap 分析：平台 ~80% 已存在，net-new = **5 支柱**，含 reuse 路徑。
2. `agency-os/handoffs/2026-05-30-1644-onboarding-portal-spec.md` — 14 段規格的任務契約 + 限制條件。
3. `.claude/plans/https-github-com-jonjonesai-claude-wp-sequential-clock.md`（24KB）— 四層控制平面 L1-L4 全文設計 / 威脅模型 / 商業定位。**已 git-tracked，跨機同步 OK**（packet 1641 舊註「不進 git」是錯的，已更正）。

**第二層（要寫規格時才逐一讀，本檔 §1/§2 已摘要 file:line）**
- Build 側源頭：見 §1 表
- Ops/監控/修復側源頭：見 §2 表

**memory（短事實）**：`project_wp_plugin_autoinstall.md`（WP Plugin Auto-Install：core logic done、sg-deploy + Trigger.dev re-deploy pending）。

---

## 1. 既有資產地圖 — BUILD / 建站側

| 主題 | 檔案（`lobster-factory/...`） | 關鍵結構（精確 shape） |
|---|---|---|
| **Plugin 包目錄** | `infra/hetzner-phase1-core/apps/next-admin/lib/wp-plugin-stack-catalog.ts` | 36 entries；`WpPlugin{slug,label,free,required,module:"base"\|"ecommerce"\|"tourism"\|"brand",alternativeSlug?,condition?}`。Base 16(鎖定)＋Ecommerce 12＋Tourism 5＋Brand 3。Resolver：`resolvePluginsForPacks(packs)`、`resolveInstallableSlugsForPacks`、`resolvePaidPluginsForPacks`、`derivePackageSlugFromPacks`→`wp-basic\|wp-business\|wc-core`。含 Kadence/Woo/FluentCRM/FluentForms/RankMath/FluentSMTP/SiteKit(GTM4WP)/LiteSpeed(conditional)。 |
| **Plugin packs SSOT(文件)** | `agency-os/docs/operations/WP_CLIENT_PLUGIN_STACK.md` | base16 + ecommerce/tourism/brand 的人讀 SSOT。 |
| **Manifest 檔(已存在)** | `lobster-factory/packages/manifests/{wp-basic,wp-business,wc-core}.json` ＋ Zod schema `lobster-factory/apps/api/src/types/manifest.ts` ＋ `apps/api/src/services/wp/wpFactory.ts` | ✅ 已驗證存在。**段 5「manifest JSON 結構」要 reuse 這個，勿憑空發明。** |
| **部門目錄(M3)** | `.../next-admin/lib/department-catalog.ts` | 20 clusters `CLU_*`；`DepartmentCluster{clusterId,label,group,matrixRows,smbDefault,templateFiles}`；SMB 預設 5 個 always-on。`buildDepartmentSelection()`、`getRequiredTemplateFiles()`。 |
| **現有 Onboard 精靈** | `.../next-admin/app/onboard/OnboardWizard.tsx` | 5 步；`ClientInfo` interface（tenantSlug/clientName/customerEmail/profile_b\|c/domain/provider/packageSlug/sshHost/wpPath/sshCredentialsRef/selectedPacks/resolved*…）。**現況是操作者導向、技術性 → net-new 要做「客戶探索式 intake form」（5 支柱之一）。** |
| **Build 契約** | `.../next-admin/lib/build-console/contracts.ts` | `BuildRunRequest`（profile_a/b/c、executionMode plan_only\|enqueue、organizationId…）；`BuildPlan`（actionKey/workflowId/stages/blockers/smokeTests/approvalRequired/productionDeployAllowed=false except profile_a staging）。profile_b=create_wp_site / profile_c=adopt_client_os。 |
| **Tenant 設定結構** | `agency-os/tenants/<slug>/core/`（範例 `company-soulful-expression`） | `ENVIRONMENT_REGISTRY.md`(SSOT staging URL)、`DEPARTMENT_SELECTION.json`、`PROFILE.md`、`sites/<site>/SITE_PROFILE.md`… |
| **Trigger.dev 建站任務** | `lobster-factory/packages/workflows/src/trigger/{create-wp-site,apply-manifest,adopt-client-os,orchestrate-tenant-provisioning}.ts` | `orchestrate-tenant-provisioning` input：`{organizationId,workspaceId?,customerEmail,providers[],hints?}`；providers∈{github,n8n,trigger,supabase,sentry,uptime_kuma,posthog}；每 provider 跑 `runProviderStep` → POST `/api/webhooks/tenant-integration` 寫 `tenant_integration_bindings`。 |
| **Supabase schema(reuse,勿重建)** | `lobster-factory/packages/db/migrations/0001..0028` | `organizations`(id,type,name,slug,status,metadata jsonb)、`sites`(site_type,primary_domain,theme_family=kadence,stack_profile=wc-core,status draft\|staging\|live)、`environments`(environment_type,base_url,hosting_provider,wp_root_path,credentials_ref,last_health_status)、`tenant_integration_bindings`(provider,secret_ref,api_metadata,provisioning_source,status UNIQUE(org,provider))、`assets`(asset_type,environment,primary_url)、`ops_action_runs`(action_id,status,approval_status,trace_id,input/output_payload)。 |

---

## 2. 既有資產地圖 — OPS / 監控 / 告警 / 自修復側

| 主題 | 檔案（`.../next-admin/...`） | 關鍵結構 |
|---|---|---|
| **事件模型** | `lib/ops-inbox/types.ts` | `Incident`(source/external_id/fingerprint/signal_type/severity/service/environment/title/occurrence_count/status/ai_diagnoses[]/notification_log[]/raw/tags)。enum：source=sentry\|uptime_kuma\|grafana\|netdata\|posthog\|manual\|deploy；severity=low\|medium\|high\|critical；status=open\|investigating\|resolved\|ignored。 |
| **去重 + 狀態機** | `lib/ops-inbox/fingerprint.ts`、`transition.ts` | fingerprint=source-specific SHA256（netdata 用 `raw.name` 不用 `raw.alarm`，2026-05-23 fix）；transition：new/duplicate/severity_escalated/reopened。 |
| **Webhook 收斂** | `app/api/webhooks/{sentry,uptime-kuma,grafana,netdata,posthog,deploy}/route.ts` ＋ `lib/ops-inbox/normalize/*` | 共同流程：verifyIngestToken(Bearer `OPS_INBOX_INGEST_TOKEN`) → readBody(256KB cap) → normalize→IncidentDraft → fingerprint → upsert ON CONFLICT(fingerprint,environment) → if new→triggerAutoClassify → dispatchNotifications。deploy 源跳過通知（VPS 直送）。 |
| **告警派送** | `lib/ops-inbox/notify/{dispatcher,rules}.ts` | channels：Slack(`OPS_INBOX_SLACK_INCIDENTS_WEBHOOK`)、Telegram(min-severity gate)。rules：new_first_occurrence/severity_escalation/reopen/critical_immediate/duplicate(節流：critical 3min、非 critical 15min)。 |
| **修復狀態機** | `lib/repair-center/{types,service}.ts` | `RepairRun`(incident_id/policy/state/approved_by/backup_status/backup_ref/github_*/deploy_status/risk_level/needs_human_review/audit_log[])。state：detected→triage_needed→approved→backing_up→repairing→pr_ready→deploy_pending→deploying→{resolved\|rolled_back\|human_only}。**critical severity 閘**：held at triage_needed 直到 `/confirm-critical`。**backup 強制**：無有效 backup_ref(≥1KB) 不修。 |
| **修復 policy 目錄** | `lib/repair-center/policy.ts` | sentry=auto_repair / uptime_kuma,grafana=analysis_only(can_escalate_to_pr) / posthog=analysis_only(禁升 PR) / netdata,deploy=human_only / manual=triage_needed。 |
| **Kill switch + 核准** | `lib/command-plane/killSwitch.ts`、`app/api/ops/approvals/route.ts` | `system_modes`：normal\|maintenance\|read_only\|emergency_stop（org-level 蓋 global，預設 normal，全 fail-closed）。approvals 佇列：`command_requests` status=queued AND risk∈(high,critical)，owner/admin 才能批。 |
| **AI 診斷** | `lib/ops-inbox/ai/triggerAutoClassify.ts`、`ai/quotaGuard.ts` | Claude Haiku → Gemini 2.0 Flash Lite cascade；Gemini 每日配額(預設 1400, RPC `ops_inbox_gemini_quota_increment`)；寫 `incident.ai_diagnoses[]`（provider/model/role/summary/cost_usd）。 |
| **per-tenant 監控綁定** | `app/api/ops/integrations/route.ts`、`app/api/webhooks/tenant-integration/route.ts`、`packages/workflows/src/lib/tenant-provisioning/providers/{n8n,triggerDev}.ts` | `tenant_integration_bindings`(provider/secret_ref `vault://tenant/{org}/...`/api_metadata/provisioning_source manual\|n8n\|trigger\|build_console\|cli/status pending\|active\|failed\|revoked)。健康檢查 `checkIntegrationHealth`。**net-new：建站後自動開 per-client Sentry project + Uptime Kuma monitors + 告警路由（5 支柱之一）。** |

---

## 3. net-new 真正缺口（5 支柱，詳見 packet 1641 §5）

1. 客戶端**智能 intake 表單**（探索式問卷，非現有技術性 OnboardWizard）
2. **spec 生成大腦**（form → sitemap/頁面/文案/設計方向/圖片需求/plugin 選擇邏輯/逐 plugin 配置）
3. **客製商品電商 package**（`wc-custom`/POD + ProductSpec generator）
4. **per-tenant 監控自動佈建**（建站後自動 Sentry project + Uptime Kuma + 告警路由；補 checkout/form/CRM-webhook/plugin-fatal 監控項）
5. **WP 執行 bridge** 續砌（`lobster-factory/packages/wp-bridge-plugin/`：Ed25519 SignatureVerifier 已 7/7 PASS → 接 NonceCache→KeyStore→自修復 transaction→KadenceValidator→PHPUnit+CI）

**待產出**：14 段完整規格 → 寫到 `agency-os/docs/specs/client-onboarding-portal-spec.md`（每章標 `✅已有(reuse:<路徑>)` 或 `🆕要做`）。

---

## 4. 跨機續接機制（為什麼這份檔能讓我「記得」）

- **會自動同步 + 浮回我眼前的**：本檔、兩個 handoff packet、`.claude/plans/...md` 全部 **git-tracked**（`.claude` 是 junction → repo）。換機 `git pull` 自動帶；AO-RESUME 第 7 段自動 inline handoff → handoff 指到本檔 → 我讀 §0 reading list → 接續。
- **不會自動同步的**：對話 context（單次性，換 session 即清空）。所以「研究過的東西」必須像這份一樣**落地成 git 檔**才算數。
- **更正**：packet 1641 §6 舊註稱 plan 檔「不進 git 也不跨機同步」= **錯**；實測 `git ls-files` 確認該檔已 tracked、已 commit，跨機 OK。
