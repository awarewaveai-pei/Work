# HETZNER_HOSTING_POLICY_COMPLETE_V2.md

**Project:** Lobster Factory  
**Version:** 2.1.0  
**Status:** Official-source-audited production-grade hosting standard draft  
**Scope:** Hetzner + WordPress / WooCommerce + Agency OS / Client OS / Factory OS  
**Primary regions:** Finland `hel1` as control plane, Singapore `sin` as Asia delivery plane  
**Default principle:** staging → QA → approval → launch  
**Source policy:** Hetzner official docs are the source of truth; Hetzner Community tutorials are implementation references only.  
**Last reviewed:** 2026-06-05 Asia/Taipei  

---

# V2 升級重點

這版不是單純增加注意事項，而是把文件升級成可稽核的 hosting standard。

## 新增內容

```yaml
v2_additions:
  - official_source_audit:
      description: 每一條核心政策對應 Hetzner 官方文件或 Community tutorial
  - source_reliability_rule:
      description: 區分 official docs、legal terms、community tutorials、internal assumptions
  - verified_vs_inference_matrix:
      description: 哪些是官方明確支撐、哪些是 Lobster Factory 架構推論、哪些需要實測
  - field_test_plan:
      description: 台灣到 Singapore/Finland 延遲、WooCommerce 壓測、還原測試、成本驗證
  - api_iac_implementation_pack:
      description: Hosting Adapter、Terraform/OpenTofu、Ansible/cloud-init、GitHub Actions 任務
  - runbook_acceptance_criteria:
      description: Backup/Restore、Abuse Notice、Incident、Migration 都有驗收標準
  - client_contract_alignment:
      description: 把 hosting tier、RTO/RPO、責任邊界轉成客戶合約附錄
```

---

# A. Source Reliability Rule

## A.1 來源優先級

```yaml
source_priority:
  p0_hetzner_official_docs:
    use_for:
      - location_behavior
      - billing
      - cancellation
      - firewall_behavior
      - backup_snapshot_limits
      - SMTP_port_restrictions
      - primary_ip_behavior
      - floating_ip_behavior
      - load_balancer_constraints
      - DPA_and_subprocessor_policy
      - account_verification_policy

  p1_hetzner_legal_terms:
    use_for:
      - prohibited_use
      - SLA_boundary
      - customer_responsibility
      - abuse_policy
      - account_termination_risk

  p2_hetzner_community_tutorials:
    use_for:
      - implementation_examples
      - WordPress_setup_reference
      - Docker_Compose_reference
      - Nginx_reverse_proxy_reference
    limitation:
      - not_binding_provider_policy
      - may_not_be_production_ready
      - must_be_adapted_to_Lobster_Factory_guardrails

  p3_lobster_factory_policy:
    use_for:
      - staging_first
      - approval_gates
      - hosting_adapter_abstraction
      - client_tier_design
      - RTO_RPO_mapping
      - incident_severity_mapping
      - cost_labeling
      - automation_boundaries
```

## A.2 必須遵守的解讀原則

```yaml
interpretation_rules:
  - official_docs_override_community_tutorials
  - provider_policy_must_not_be_inferred_from_tutorials
  - community_tutorials_are_examples_not_standards
  - any_production_automation_must_be_more_conservative_than_tutorials
  - field_tests_override_assumptions_for_latency_performance_and_restore_time
```

---

# B. Official Source Audit

下表把核心政策對應到 Hetzner 官方文件。文件內的 URL 不使用 `utm_source`，方便放入知識庫。

| Policy / Topic | Verified from official source | Adopted Lobster Factory rule |
|---|---|---|
| Locations | https://docs.hetzner.com/cloud/general/locations/ | Germany Nuremberg / Falkenstein and Finland Helsinki are Hetzner-owned data center parks; USA and Singapore use colocation. Use `hel1` for control plane and `sin` for Asia delivery only after latency tests. |
| Backups / Snapshots | https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/ | Backups/Snapshots are server disk copies, daily backups have 7 slots, snapshots persist until deleted, and attached Volumes are not included. Therefore offsite backup and volume backup are mandatory. |
| Snapshot consistency | https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/ | Running-system snapshots may not be disk-consistent. Production snapshots must be paired with DB dump / app-level backup before high-risk changes. |
| Cloud Firewall | https://docs.hetzner.com/cloud/firewalls/faq/ | Hetzner Firewalls define allowed traffic; all other traffic is dropped. Use allowlist firewall design, not blacklist-first design. |
| SMTP ports | https://docs.hetzner.com/cloud/servers/faq/ | Ports 25 and 465 are blocked by default on cloud servers; use port 587 via external mail delivery service for WordPress transactional email. |
| Primary IP | https://docs.hetzner.com/cloud/servers/primary-ips/faq/ | Primary IPs are managed independently and determine public network access. Track and delete unused Primary IPs. |
| Floating IP | https://docs.hetzner.com/cloud/floating-ips/overview/ | Floating IP can be reassigned within same network zone/project and is useful for simple failover, but must be OS-configured and is not HA by itself. |
| Load Balancer | https://docs.hetzner.com/networking/load-balancers/faq/ | Private IP targets require the Load Balancer and Cloud Server to be in the same private Cloud Network. HA design must respect this constraint. |
| Private Networks | https://docs.hetzner.com/networking/networks/faq/ | Private network traffic routes via the network gateway; private network does not replace TLS / mTLS / WireGuard for sensitive data. |
| DPA / Data Protection | https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/ | If Hetzner processes client personal data on your behalf, record DPA and subprocessors. Singapore/third-country storage must be disclosed to clients when applicable. |
| Account signup | https://docs.hetzner.com/general/billing-and-account-management/account-getting-started/ | Use valid email, real contact/billing details, and avoid VPN/free email during signup to reduce fraud review risk. |
| Fraud prevention | https://docs.hetzner.com/general/security-and-identify/fraud-prevention-faq/ | Avoid VPN and free email during registration; keep account identity consistent. |
| Payment risk | https://docs.hetzner.com/general/billing-and-account-management/billing-at-hetzner/payment-overview/ | Late payment can lead to locked servers/services, cancelled products, or locked/deleted account; first invoice risk is higher for new customers. |
| Product cancellation | https://docs.hetzner.com/general/billing-and-account-management/cancellation/cancellations-overview/ | Most products continue until actively cancelled/deleted. Implement weekly unused-resource cleanup. |
| 2FA | https://docs.hetzner.com/general/security-and-identify/two-factor-authentication/ | Enable 2FA for all Hetzner Accounts and protect recovery keys. |
| Price changes | https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/ | Do not rely on old blog/YouTube pricing. Cost estimator must fetch or manually update current price tables. |
| Cloud API capability scope | https://docs.hetzner.com/cloud/general/faq/ | Hetzner API can create/delete servers, snapshots, backups, Floating IPs, Volumes, Networks, Load Balancers, Buckets, DNS zones. Tokens must be tightly scoped and never exposed to agents. |

---

# C. Community Tutorial Notes

Community tutorials are helpful, but they are not the production standard.

| Tutorial | URL | Useful idea | Lobster Factory adaptation |
|---|---|---|---|
| WordPress with Docker Compose | https://community.hetzner.com/tutorials/run-wordpress-in-a-container-using-docker-compose/ | WordPress can be isolated with Docker Compose using separate services for WordPress/PHP-FPM, nginx, and MariaDB. | Use as reference for staging / standardized environments. For production, add backups, monitoring, secrets, Cloudflare, smoke tests, and approval gates. |
| WordPress with CyberPanel / OpenLiteSpeed | https://community.hetzner.com/tutorials/how-to-install-wordpress-with-cyberpanel-openlitespeed-on-ubuntu-20.04.4-LTS/ | Shows control-panel style WordPress setup. | Useful for learning, but do not make panel UI the source of truth. Factory OS should use manifest + IaC + workflow logs. |
| Nginx Proxy Manager | https://community.hetzner.com/tutorials/installing-nginx-proxy-manager/ | Useful reverse proxy pattern for smaller self-hosted setups. | For production, prefer Git-managed Nginx/Caddy config or Cloudflare Tunnel/Zero Trust policy over manual UI-only config. |
| EasyPanel self-host PaaS | https://community.hetzner.com/tutorials/build-your-own-paas-with-hetzner-cloud/ | Useful idea for PaaS-like self-hosting. | Can be used for internal tooling but not as the only production governance layer. Must integrate approvals, backups, logs, and cost labels. |

---

# D. Verified vs Inference vs Field Test Matrix

## D.1 Officially verified

```yaml
officially_verified:
  - hel1_is_hetzner_owned_data_center_park
  - singapore_is_colocation_space
  - backups_and_snapshots_do_not_include_volumes
  - each_server_has_7_backup_slots
  - snapshots_persist_until_deleted
  - firewall_allows_rules_and_drops_other_traffic
  - ports_25_and_465_blocked_by_default_on_cloud
  - port_587_external_mail_services_is_recommended_alternative
  - primary_ips_are_managed_independently_from_cloud_servers
  - floating_ips_can_be_reassigned_within_same_network_zone_and_project
  - private_ip_load_balancer_targets_require_same_private_cloud_network
  - dpa_required_when_hetzner_processes_personal_data_on_your_behalf
  - account_signup_should_avoid_vpn_and_free_email_if_possible
  - late_payment_can_lock_services_or_account
  - products_must_be_actively_cancelled_or_deleted
```

## D.2 Lobster Factory architectural inference

```yaml
architecture_inference:
  - finland_is_better_for_control_plane_than_taiwan_public_runtime
  - singapore_is_better_default_for_taiwan_delivery_than_finland
  - checkout_should_not_synchronously_depend_on_finland_backend
  - wordpress_production_should_be_staging_first
  - hetzner_backup_is_not_enough_for_woocommerce_disaster_recovery
  - cloudflare_should_be_mandatory_edge_layer
  - fluent_smtp_plus_external_smtp_should_be_required
  - all_hetzner_resources_need_organization_project_site_labels
  - agents_should_have_staging_only_tokens_by_default
  - production_delete_and_rebuild_should_be_blocked_by_policy
```

## D.3 Field test required

```yaml
field_test_required:
  latency:
    - taiwan_chunghwa_to_singapore
    - taiwan_chunghwa_to_finland
    - taiwan_mobile_to_singapore
    - taiwan_mobile_to_finland
    - far_eastone_to_singapore
    - far_eastone_to_finland

  performance:
    - wordpress_homepage_ttfb_from_taiwan
    - woocommerce_checkout_p95
    - wp_admin_load_time
    - fluentcrm_campaign_admin_load
    - cloudflare_cache_hit_ratio

  reliability:
    - backup_restore_time_for_10gb_site
    - backup_restore_time_for_50gb_site
    - db_dump_restore_time
    - snapshot_restore_time
    - failover_time_with_floating_ip
    - dns_cutover_time_with_cloudflare

  cost:
    - monthly_cost_per_site
    - singapore_traffic_usage
    - snapshot_storage_growth
    - backup_storage_growth
    - smtp_cost_per_client
    - observability_cost_per_client
```

---

# E. Field Test Plan

## E.1 Taiwan latency and throughput test

```bash
# From Taiwan network, test each region.
ping -c 20 <SINGAPORE_TEST_IP>
ping -c 20 <FINLAND_TEST_IP>

mtr -rwzc 100 <SINGAPORE_TEST_IP>
mtr -rwzc 100 <FINLAND_TEST_IP>

curl -o /dev/null -s -w '
dns: %{time_namelookup}
connect: %{time_connect}
tls: %{time_appconnect}
ttfb: %{time_starttransfer}
total: %{time_total}
speed_download: %{speed_download}
' https://<test-domain>
```

Acceptance:

```yaml
latency_acceptance:
  singapore_public_runtime:
    ttfb_from_taiwan_target: under_800ms
    homepage_total_target: under_2_5s_with_cache
  finland_control_plane:
    admin_operations_only: true
    public_runtime_dependency: forbidden
```

## E.2 WooCommerce launch test

```yaml
woocommerce_launch_test:
  required:
    - homepage_load
    - product_page_load
    - add_to_cart
    - cart_load
    - checkout_load
    - test_order_created
    - order_email_sent
    - admin_order_visible
    - webhook_received
    - rollback_plan_confirmed
```

## E.3 Restore drill

```yaml
restore_drill:
  monthly:
    - choose_random_staging_or_low_risk_site
    - restore_from_db_dump
    - restore_wp_content
    - validate_wp_admin_login
    - validate_homepage
    - validate_checkout_if_woocommerce
    - record_restore_duration
    - record_data_loss_window
```

---

# F. Hetzner API / IaC Implementation Requirements

## F.1 Resource naming

```yaml
resource_naming:
  format: lf-{env}-{region}-{org_slug}-{site_slug}-{role}-{nn}
  example:
    - lf-stg-sin-acme-shop-web-01
    - lf-prod-sin-acme-shop-db-01
    - lf-int-hel-agency-n8n-worker-01
```

## F.2 Labels

```yaml
required_labels:
  organization_id: uuid
  workspace_id: uuid
  project_id: uuid
  site_id: uuid_or_null_for_internal
  environment: staging_or_production_or_internal
  plane: control_or_delivery_or_observability
  region: hel1_or_sin
  cost_center: client_or_internal
  owner: agency_or_client
  managed_by: lobster_factory
  provisioned_by: workflow_or_manual
  created_by_run_id: workflow_run_uuid
```

## F.3 Token model

```yaml
api_token_model:
  staging_token:
    allowed:
      - create_server
      - create_snapshot
      - delete_staging_server
      - list_resources
      - read_resource_status
    forbidden:
      - delete_production_server
      - rebuild_production_server
      - disable_production_backup

  production_token:
    allowed:
      - list_resources
      - read_resource_status
      - create_snapshot
    forbidden:
      - delete_server
      - rebuild_server
      - detach_volume
      - delete_backup
      - delete_snapshot_without_approval

  break_glass_token:
    storage: emergency_secret_store
    use_requires:
      - owner_approval
      - incident_id
      - postmortem
```

## F.4 OpenTofu / Terraform minimum resources

```hcl
# FILE: infra/hetzner/example-main.tf
terraform {
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.0"
    }
  }
}

variable "hcloud_token" {
  type      = string
  sensitive = true
}

provider "hcloud" {
  token = var.hcloud_token
}

resource "hcloud_firewall" "web" {
  name = "lf-web-firewall"

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # SSH should be restricted to VPN / static IP.
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = var.ssh_allowlist
  }
}
```

---

# G. Runbook Acceptance Criteria

## G.1 Backup / Restore runbook

```yaml
backup_restore_acceptance:
  - backup_job_logs_success
  - db_dump_exists
  - wp_content_backup_exists
  - offsite_copy_exists
  - restore_test_completed
  - restore_duration_recorded
  - data_loss_window_recorded
```

## G.2 Incident runbook

```yaml
incident_acceptance:
  - incident_id_created
  - severity_assigned
  - affected_site_identified
  - client_impact_assessed
  - rollback_or_fix_selected
  - client_notification_decision_recorded
  - postmortem_required_for_sev1
```

## G.3 Abuse notice runbook

```yaml
abuse_notice_acceptance:
  - provider_notice_preserved
  - server_and_site_identified
  - logs_preserved
  - malicious_content_removed_or_quarantined
  - client_notified_if_client_related
  - provider_response_sent
  - prevention_policy_updated
```

## G.4 Migration / Exit runbook

```yaml
migration_acceptance:
  - destination_environment_created
  - db_import_verified
  - files_synced
  - staging_smoke_test_passed
  - smtp_verified
  - checkout_verified_if_applicable
  - dns_ttl_lowered
  - final_delta_sync_completed
  - cutover_completed
  - old_server_retained_for_rollback_window
```

---

# H. Cursor Implementation Pack V2

```markdown
# TASK: Upgrade Hetzner Hosting Layer to Official-Source-Audited V2

You are implementing the Hetzner hosting layer for Lobster Factory.

## Goal

Turn Hetzner from manual VPS usage into a safe, observable, cost-trackable, staging-first hosting adapter.

## Source Rules

- Treat Hetzner official docs as provider source of truth.
- Treat Hetzner Community tutorials as implementation references only.
- Do not copy tutorial shortcuts into production unless they pass Lobster Factory guardrails.

## Architecture

- Finland / hel1 = control plane
- Singapore / sin = Asia delivery plane
- Cloudflare = required edge layer
- Production = approval-gated
- Agents = staging-only by default

## Files to create

- docs/hosting/HETZNER_HOSTING_POLICY_COMPLETE_V2.md
- docs/hosting/HETZNER_SOURCE_AUDIT.md
- docs/hosting/HETZNER_FIELD_TEST_PLAN.md
- docs/hosting/HETZNER_BACKUP_RESTORE_RUNBOOK.md
- docs/hosting/HETZNER_ABUSE_NOTICE_RUNBOOK.md
- docs/hosting/HETZNER_INCIDENT_RUNBOOK.md
- docs/hosting/HETZNER_EXIT_PLAN.md
- packages/hosting/src/HostingAdapter.ts
- packages/hosting/src/providers/hetzner/HetznerHostingAdapter.ts
- packages/hosting/src/providers/hetzner/HetznerPolicy.ts
- packages/hosting/src/providers/hetzner/HetznerLabels.ts
- packages/hosting/src/providers/hetzner/HetznerCostEstimator.ts
- infra/hetzner/opentofu/main.tf
- infra/hetzner/ansible/bootstrap.yml
- .github/workflows/hetzner-staging-provision.yml

## Required behavior

1. Create Singapore staging server with required labels.
2. Create pre-deploy snapshot.
3. Write environment record to Supabase.
4. Estimate monthly cost by site_id.
5. Block production delete/rebuild by default.
6. Require approval record for production launch.
7. Never log API tokens or secrets.
8. Generate rollback plan for every production launch.
9. Record workflow_run_id for every infrastructure action.

## Acceptance Criteria

- Staging server can be created safely.
- Labels are attached to every resource.
- Production destructive actions throw policy error.
- Snapshot action is logged.
- Cost estimate can be generated per site.
- Launch checklist is generated.
- Rollback plan is generated.
- Source audit file exists.
- Field test plan exists.
```

---


---

# I. Main Policy Body


**Project:** Lobster Factory  
**Version:** 2.1.0  
**Status:** Official-source-audited production-grade hosting standard draft  
**Scope:** Hetzner + WordPress / WooCommerce + Agency OS / Client OS / Factory OS  
**Primary regions:** Finland `hel1` as control plane, Singapore `sin` as Asia delivery plane  
**Default principle:** staging → QA → approval → launch  
**Source policy:** Hetzner official docs are the source of truth; Community tutorials are implementation references only.  

---

# 0. 核心結論

Hetzner 可以繼續用，但要把它定位成：

> **高 CP 值 unmanaged infrastructure，不是 managed WordPress hosting。**

Hetzner 幫你提供主機資源，但以下能力要由 Lobster Factory 自己標準化：

```yaml
must_manage_by_lobster_factory:
  - Cloudflare DNS / WAF / CDN
  - SSH hardening
  - firewall
  - backup
  - offsite backup
  - restore drill
  - uptime monitoring
  - Sentry / logs
  - SMTP provider
  - WordPress security
  - staging -> QA -> approval -> launch
  - cost tracking
  - abuse handling
  - compliance / DPA documentation
```

對 Lobster Factory 來說，Hetzner 不應該只是「租幾台 VPS」，而應該被產品化成：

```yaml
hosting_layer:
  provider: hetzner
  role: one_of_hosting_adapters
  must_be:
    - controllable
    - observable
    - reversible
    - cost_trackable
    - replaceable
```

一句話：

> **Hetzner 值得用，但要把它變成 Lobster Factory 的標準化 Hosting Layer，而不是手工 VPS。芬蘭當控制平面，新加坡當亞洲交付平面，所有 production 都必須 staging-first、可回滾、可觀測、可算成本、不可由 agent 直接破壞。**

---

# 1. 區域架構標準

目前架構：

```yaml
current_setup:
  backend: Hetzner Finland
  platform: Hetzner Singapore
```

這個架構可以保留。

---

## 1.1 Finland / hel1 定位：Control Plane

```yaml
finland_backend:
  role:
    - Agency OS 後台
    - n8n / worker
    - internal API
    - admin dashboard
    - logs / reports
    - backup registry
    - decision engine
    - batch jobs
  public_runtime: false
```

芬蘭適合放後台、內部工具、排程、報表、控制平面。

**不可讓台灣訪客每次頁面請求都同步打芬蘭 API。**

---

## 1.2 Singapore / sin 定位：Delivery Plane

```yaml
singapore_platform:
  role:
    - WordPress
    - WooCommerce
    - client portal
    - public API
    - staging sites
    - production sites
    - checkout
    - FluentCRM
    - Fluent Forms
  public_runtime: true
```

新加坡適合放面向台灣 / 亞洲訪客的網站與交易現場。

---

## 1.3 正確資料流

```text
台灣訪客
→ Cloudflare
→ Singapore WordPress / WooCommerce
→ 本地 DB / cache 優先處理
→ 事件 async sync 回 Finland backend
```

不要做成：

```text
台灣訪客
→ Singapore WordPress
→ Finland API / DB
→ Singapore
→ 台灣訪客
```

尤其不要讓以下流程同步依賴芬蘭：

```yaml
do_not_depend_on_finland_realtime:
  - checkout
  - login
  - cart
  - form_submit
  - member_area
  - WooCommerce order creation
  - FluentCRM user action
```

---

# 2. Hetzner 適用範圍

## 2.1 適合

```yaml
hetzner_good_for:
  - 一般網站
  - WordPress / WooCommerce 中小型站
  - API server
  - Docker app
  - n8n self-hosted
  - staging server
  - SaaS MVP
  - internal tools
  - worker / cron jobs
  - backup node
  - 高 CP 值 CPU/RAM/SSD 需求
```

---

## 2.2 不太適合

```yaml
hetzner_not_ideal_for:
  - 完全不想碰維運的人
  - 大量寄信 / EDM / 冷信
  - public proxy / VPN 轉售
  - crypto mining
  - 外部 port scanning
  - 容易收到 abuse complaint 的服務
  - 沒有 HA 卻不能停機的高價服務
  - 需要 AWS/GCP 等級 managed ecosystem 的系統
```

---

# 3. 下單前主要風險

## 3.1 帳號驗證與付款風險

Hetzner 對新帳號、付款資料、VPN、濫用風險比較敏感。正式服務不要第一天就全部搬進去。

```yaml
account_safety:
  registration:
    - use_real_identity_or_company_info
    - avoid_vpn_during_signup
    - avoid_temporary_or_suspicious_email
    - billing_info_should_match_payment_method
  payment:
    - primary_card
    - backup_card_or_paypal
    - billing_email_owner
    - billing_email_ops
  first_month:
    - pay_first_invoice_on_time
    - do_not_create_many_servers_immediately
    - test_support_process
    - test_abuse_response_process
```

---

## 3.2 關機仍會計費

Hetzner Cloud server 關機不等於停止收費。只要資源存在，就可能繼續計費。

會持續產生成本的資源：

```yaml
billable_resources:
  - cloud_server
  - primary_ipv4
  - unused_primary_ip
  - floating_ip
  - volume
  - snapshot
  - backup
  - load_balancer
  - outbound_traffic_over_quota
```

Staging / preview site 必須有清理策略：

```yaml
staging_retention_policy:
  preview_site:
    delete_after_days: 7
  staging_site:
    archive_after_days: 30
  unused_primary_ip:
    delete_if_unassigned: true
  unused_volume:
    alert_after_days: 3
  unused_snapshot:
    review_weekly: true
```

---

## 3.3 新加坡流量額度與跨區流量

新加坡離台灣近，但流量額度與價格通常不如 EU 漂亮。

```yaml
cross_region_cost_rule:
  avoid:
    - 每頁同步 call 芬蘭 API
    - checkout 即時依賴芬蘭服務
    - 新加坡大量同步 media 到芬蘭
    - 大量 logs 即時跨區傳輸
    - 大量 backup 每小時跨區搬移
  prefer:
    - async event sync
    - compressed logs
    - scheduled batch reporting
    - only_metadata_cross_region
    - media_stays_near_runtime
```

---

# 4. Client Hosting Tier Matrix

這一段用來對應你的客戶方案、報價、SLA 與基礎設施隔離程度。

```yaml
CLIENT_HOSTING_TIERS:
  starter:
    target:
      - 形象站
      - landing page
      - low traffic blog
    infrastructure:
      model: shared_vps
      region: singapore
      max_sites_per_server: 5_to_10
    backup:
      frequency: daily
      offsite: true
      restore_drill: quarterly
    monitoring:
      uptime: true
      app_errors: basic
    support:
      response: best_effort
    not_suitable_for:
      - high_order_woocommerce
      - mission_critical_checkout

  business:
    target:
      - 一般公司站
      - low_to_mid_woocommerce
      - lead_generation_site
    infrastructure:
      model: dedicated_vps_per_client_or_project
      region: singapore
    backup:
      frequency: daily
      pre_deploy_snapshot: required
      offsite: true
      restore_drill: monthly
    monitoring:
      uptime: true
      server_metrics: true
      sentry: true
    support:
      response: business_hours

  commerce:
    target:
      - WooCommerce
      - FluentCRM heavy site
      - paid traffic funnel
    infrastructure:
      model: dedicated_vps
      region: singapore
      cache:
        - page_cache
        - object_cache
        - database_tuning
    backup:
      db_dump: daily
      wp_content: daily
      pre_update_snapshot: required
      offsite: required
    monitoring:
      uptime: true
      checkout_monitor: true
      email_delivery_monitor: true
      performance_monitor: true
    support:
      incident_policy: required

  premium:
    target:
      - high_value_client
      - enterprise_site
      - high_traffic_store
    infrastructure:
      model: dedicated_vps_or_managed_wp
      provider_options:
        - hetzner_dedicated
        - kinsta
        - cloudways_tokyo
        - vultr_tokyo
    backup:
      frequency: daily_or_more
      offsite: required
      restore_drill: monthly
    monitoring:
      full_observability: true
    support:
      sla: custom
      incident_response: priority
```

---

# 5. RTO / RPO 標準

「有備份」不等於「立即恢復」。每個方案要定義 RTO / RPO。

```yaml
RTO_RPO_POLICY:
  starter:
    rto: 24h
    rpo: 24h
    description: 可接受一天內恢復，最多遺失一天資料

  business:
    rto: 8h
    rpo: 24h
    description: 工作日內恢復，最多遺失一天資料

  commerce:
    rto: 4h
    rpo: 6h_to_24h
    description: 電商站需要較短恢復時間，訂單資料要更保守

  premium:
    rto: 1h_to_4h
    rpo: 1h_to_6h
    description: 需要額外架構、備援、監控與費用
```

---

# 6. 安全標準

## 6.1 SSH 基準

```yaml
ssh_policy:
  password_login: false
  root_login: false
  ssh_key_only: true
  fail2ban: true
  unattended_security_updates: true
  access_method:
    - static_ip_allowlist
    - vpn
    - tailscale
    - cloudflare_zero_trust
```

---

## 6.2 Firewall 基準

```yaml
firewall_rules:
  inbound:
    - port: 22
      source: your_static_ip_or_vpn_only
      purpose: SSH
    - port: 80
      source: public_or_cloudflare
      purpose: HTTP redirect / ACME
    - port: 443
      source: public_or_cloudflare
      purpose: HTTPS

  never_public:
    - mysql_3306
    - postgres_5432
    - redis_6379
    - mongodb_27017
    - elasticsearch_9200
    - docker_api_2375
    - phpmyadmin
    - adminer
    - portainer
    - n8n_editor
```

---

## 6.3 Cloudflare 必須放前面

```yaml
cloudflare_required:
  dns: true
  waf: true
  ssl_mode: full_strict
  cache_rules: true
  rate_limit: true
  bot_protection: true
  zero_trust_for_admin: true
  webhook_gateway: true
```

建議路徑：

```text
visitor → Cloudflare → Singapore platform
admin → Cloudflare Zero Trust / VPN → Finland backend
```

---

## 6.4 Private Network 不等於加密

```yaml
internal_network_security:
  db_connection: TLS
  service_to_service: HTTPS_or_mTLS
  redis: private_network_only
  admin_access: WireGuard_or_Tailscale
  secrets_transfer: never_plaintext
```

---

# 7. Access Governance / Offboarding

你需要處理人員離職、承包商退場、客戶交接。

```yaml
ACCESS_GOVERNANCE:
  required:
    - password_manager
    - 2fa_for_all_admins
    - ssh_key_inventory
    - api_token_inventory
    - quarterly_access_review
    - emergency_break_glass_account

  offboarding_checklist:
    - remove_ssh_key
    - revoke_vpn_access
    - revoke_cloudflare_access
    - revoke_hetzner_access
    - revoke_github_access
    - revoke_wordpress_admin
    - rotate_shared_secrets_if_any
    - audit_recent_activity

  client_handover:
    - document_admin_accounts
    - document_dns_owner
    - document_hosting_owner
    - document_backup_policy
    - document_smtp_provider
    - document_maintenance_scope
```

---

# 8. Server Bootstrap Standard

## 8.1 基準

```yaml
SERVER_BOOTSTRAP_STANDARD:
  os:
    allowed:
      - Ubuntu LTS
      - Debian Stable
    timezone: UTC_or_Asia_Taipei
    locale: en_US.UTF-8

  users:
    root_login: disabled
    deploy_user: required
    sudo_access: limited
    ssh_key_only: true

  base_packages:
    - curl
    - git
    - unzip
    - ufw
    - fail2ban
    - unattended-upgrades
    - htop
    - jq
    - rsync
    - logrotate

  web_stack:
    reverse_proxy:
      - nginx
      - openlitespeed_optional
    php:
      version_policy: supported_lts_only
      required_extensions:
        - mysqli
        - curl
        - mbstring
        - xml
        - zip
        - gd
        - imagick
        - intl
        - bcmath
        - redis
    database:
      - mariadb
      - mysql
    cache:
      - redis

  wordpress_tools:
    - wp_cli
    - composer_optional
    - backup_cli
    - malware_scan_tool
```

---

## 8.2 第一台機器 bootstrap shell 範例

```bash
adduser deploy
usermod -aG sudo deploy

mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/
chown -R deploy:deploy /home/deploy/.ssh
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys

sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/^#\?PubkeyAuthentication.*/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl reload ssh

apt update
apt upgrade -y
apt install ufw fail2ban unattended-upgrades curl git unzip htop jq rsync logrotate -y

ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw enable
```

> Production 建議再加 Hetzner Cloud Firewall、Cloudflare WAF、Zero Trust 或 VPN，不要只靠 ufw。

---

# 9. Infrastructure as Code Policy

避免手工主機變黑盒。

```yaml
IAC_POLICY:
  tools:
    preferred:
      - OpenTofu
      - Terraform
      - Ansible
      - cloud_init
    optional:
      - Packer
      - GitHub_Actions

  required_for:
    - firewall_rules
    - server_creation
    - labels
    - volumes
    - floating_ips
    - load_balancers
    - cloudflare_dns
    - cloudflare_waf_rules

  state_management:
    terraform_state:
      storage: secure_remote_backend
      encryption: required
      access: restricted
    state_backup: required

  production_rules:
    manual_console_change: discouraged
    destructive_plan: approval_required
    plan_review: required
    apply_to_production: human_approved_only
```

---

# 10. Backup / Restore / Disaster Recovery

## 10.1 不要只靠 Hetzner Snapshot

Hetzner Backups / Snapshots 是 server disk 層級的副本，但不等於完整備份策略。

```yaml
hetzner_backup_limitations:
  - backup_slots_are_limited
  - backups_bound_to_server
  - deleting_server_may_delete_backups
  - attached_volumes_not_included
  - running_snapshot_disk_consistency_not_guaranteed
```

---

## 10.2 正式備份策略

```yaml
backup_policy:
  server_level:
    hetzner_backup: enabled
    pre_deploy_snapshot: required
    pre_plugin_update_snapshot: required

  application_level:
    database_dump: daily
    wp_content_backup: daily
    config_backup: daily

  offsite_backup:
    required: true
    options:
      - Cloudflare R2
      - Hetzner Storage Box
      - Supabase Storage
      - S3-compatible storage
      - other_provider_storage

  restore:
    restore_drill: monthly
    restore_runbook: required
    rollback_plan: required_before_launch
```

---

## 10.3 Restore Runbook

```yaml
RESTORE_RUNBOOK:
  trigger:
    - production_down
    - malware_detected
    - failed_deploy
    - corrupted_database
    - accidental_delete

  steps:
    - create_incident
    - identify_last_known_good_backup
    - notify_internal_owner
    - if_client_impacting_notify_client
    - provision_clean_restore_environment
    - restore_database
    - restore_wp_content
    - restore_config
    - run_smoke_tests
    - verify_admin_login
    - verify_homepage
    - verify_forms
    - verify_checkout_if_woocommerce
    - switch_dns_or_restore_original
    - monitor_24h
    - write_postmortem
```

---

# 11. WordPress / WooCommerce Hosting 標準

## 11.1 Server 規格建議

```yaml
wordpress_baseline:
  staging:
    cpu: 2_vcpu
    ram: 4_gb
    disk: 40_gb_plus
    use_for:
      - build
      - QA
      - plugin_testing

  small_production:
    cpu: 2_to_4_vcpu
    ram: 4_to_8_gb
    disk: 80_gb_plus
    use_for:
      - company_site
      - lead_gen_site
      - low_traffic_woocommerce

  ecommerce_production:
    cpu: 4_vcpu_plus
    ram: 8_gb_plus
    disk: 160_gb_plus
    required:
      - object_cache
      - page_cache
      - database_tuning
      - uptime_monitoring
      - offsite_backup
```

---

## 11.2 WordPress Factory Flow

所有 WordPress 都應該走 manifest / workflow。

```yaml
wp_factory_flow:
  phase_1_setup:
    - create_staging_environment
    - install_wordpress
    - apply_manifest_wc_core
    - configure_smtp
    - configure_dns
    - configure_ssl

  phase_2_qa:
    - smoke_tests
    - plugin_conflict_check
    - performance_baseline
    - security_scan
    - qa_report

  phase_3_launch:
    - require_approval
    - require_backup_verified
    - require_dns_ttl_ready
    - deploy_production
    - purge_cache
    - monitor_24h
```

---

## 11.3 wc-core stack

```yaml
wc_core_stack:
  theme:
    - Kadence
  plugins:
    - Kadence Blocks
    - WooCommerce
    - CartFlows
    - Rank Math
    - FluentCRM
    - Fluent Forms
    - FluentSMTP
    - Google Site Kit
    - LiteSpeed Cache conditional
```

---

## 11.4 WordPress Update Risk Matrix

```yaml
WORDPRESS_UPDATE_POLICY:
  auto_allowed:
    low_risk:
      - minor_security_patch
      - translation_update
      - inactive_plugin_patch_on_staging

  staging_required:
    medium_risk:
      - wordpress_minor_update
      - plugin_minor_update
      - theme_minor_update
      - cache_plugin_change
      - seo_plugin_change

  approval_required:
    high_risk:
      - woocommerce_update
      - payment_gateway_update
      - checkout_plugin_update
      - membership_plugin_update
      - fluentcrm_major_update
      - rank_math_major_update
      - php_version_upgrade
      - database_version_upgrade

  forbidden_directly_on_production:
    - bulk_plugin_update
    - major_version_update_without_snapshot
    - checkout_change_without_test_order
    - payment_gateway_live_key_change_without_manual_check
```

---

# 12. Database Policy

WooCommerce 最容易壞在 DB，DB 必須單獨定義政策。

```yaml
DATABASE_POLICY:
  default:
    engine: mariadb_or_mysql
    location: same_region_as_wordpress_runtime
    public_access: forbidden
    backup: daily_dump
    slow_query_log: enabled

  woocommerce:
    separate_db_recommended: true
    object_cache_required: true
    order_tables_monitoring: required
    cleanup:
      - expired_transients
      - action_scheduler_logs
      - old_revisions
      - spam_comments
      - failed_webhook_logs

  high_value_client:
    dedicated_db: required
    replication: recommended
    point_in_time_recovery: recommended
```

---

# 13. Object Storage / Media Policy

`wp-content/uploads` 會越來越大，必須先定義 media storage 策略。

```yaml
MEDIA_STORAGE_POLICY:
  starter:
    uploads_location: local_disk
    backup: daily

  business:
    uploads_location: local_disk_with_offsite_sync
    backup: daily
    cdn: cloudflare

  commerce:
    uploads_location: local_disk_with_r2_or_s3_sync
    backup: daily
    media_optimization: required
    image_compression: required

  premium:
    uploads_location: object_storage_preferred
    cdn: required
    lifecycle_policy: required
```

---

# 14. Email / SMTP 標準

不要用主機直接寄信。不要依賴 PHP mail / local sendmail。

```yaml
email_policy:
  wordpress_plugin: FluentSMTP
  provider_options:
    - Amazon SES
    - Mailgun
    - Postmark
    - Brevo
    - Resend
    - Google Workspace SMTP
  required_dns:
    - SPF
    - DKIM
    - DMARC
  do_not_use:
    - php_mail
    - local_sendmail
    - self_hosted_mail_server_for_client_sites
```

必測：

```yaml
email_must_test:
  - WooCommerce order email
  - password_reset
  - FluentCRM campaign
  - form_notification
  - admin_notification
```

---

# 15. Abuse / IP 信譽

Hetzner 對 abuse complaint 處理偏硬，所以所有站都要有防濫用設計。

```yaml
abuse_prevention:
  no_bulk_email_from_server: true
  use_transactional_smtp: true
  malware_scan: scheduled
  wp_uploads_block_php_execution: true
  rate_limit_forms: true
  block_fake_registration: true
  logs:
    keep_auth_logs_days: 30
    keep_nginx_logs_days: 30
  response_process:
    abuse_contact_email: required
    takedown_runbook: required
    client_notification_template: required
```

WordPress 特別要處理：

```yaml
wordpress_security:
  - block_php_execution_in_uploads
  - disable_file_editor
  - strong_admin_password
  - two_factor_auth_for_admin
  - limit_login_attempts
  - scheduled_malware_scan
  - plugin_update_policy
  - security_headers
```

---

## 15.1 Abuse Notice Runbook

```yaml
ABUSE_NOTICE_RUNBOOK:
  intake:
    - receive_notice
    - create_incident
    - classify_severity
    - identify_server
    - identify_site
    - identify_client
    - preserve_logs

  first_response:
    within: 24h_or_faster
    actions:
      - acknowledge_notice
      - disable_abusive_content_if_clear
      - block_user_or_ip_if_needed
      - suspend_compromised_form_or_upload
      - notify_client_if_client_related

  investigation:
    check:
      - nginx_logs
      - auth_logs
      - wp_users
      - recent_plugin_changes
      - uploads_directory
      - malware_scan
      - outbound_email_logs
      - cron_jobs

  remediation:
    - remove_malware
    - patch_plugin
    - rotate_passwords
    - block_php_execution_in_uploads
    - update_waf_rules
    - document_root_cause

  closure:
    - reply_to_provider
    - write_postmortem
    - update_prevention_policy
```

---

# 16. 多客戶隔離

不要把所有客戶都塞同一台。

```yaml
tenant_isolation_policy:
  low_tier:
    model: shared_server
    max_sites_per_server: 5_to_10
    suitable_for:
      - brochure_site
      - low_traffic_site
      - staging

  standard_woocommerce:
    model: dedicated_vps_per_client_or_project
    suitable_for:
      - paid_client_production
      - ecommerce
      - CRM_heavy_site

  premium_client:
    model: dedicated_vps_or_managed_wp
    suitable_for:
      - high_value_client
      - traffic_sensitive_client
      - checkout_sensitive_client

  high_risk_client:
    model: isolated_project_and_separate_credentials
    suitable_for:
      - legal_sensitive
      - payment_sensitive
      - high_abuse_risk
```

---

# 17. Cost Tracking / Labels

每個 Hetzner resource 都要能回推到客戶、專案、站點、環境。

```yaml
hetzner_labels:
  organization_id: org_xxx
  workspace_id: ws_xxx
  project_id: project_xxx
  site_id: site_xxx
  environment: staging_or_production
  cost_center: client_or_internal
  owner: agency_or_client
```

成本項目至少要記：

```yaml
cost_entries:
  - server
  - primary_ipv4
  - floating_ip
  - volume
  - snapshot
  - backup
  - load_balancer
  - traffic_overage
  - storage
  - email_sending
  - workflow_execution
  - developer_intervention_time
```

---

# 18. API Token / Automation 權限

不要一把 Hetzner API token 全開給所有 agent。

```yaml
hetzner_token_policy:
  staging_token:
    allowed:
      - create_server
      - create_snapshot
      - rebuild_staging
      - delete_staging
      - read_resources

  production_token:
    allowed:
      - read_resources
      - create_snapshot
    blocked:
      - delete_server
      - rebuild_server
      - detach_volume
      - disable_backup

  agent_access:
    production: false
    staging_only: true

  storage:
    secret_manager_only: true
    never_log_plaintext: true
```

---

# 19. Production Launch Gate

正式站不是 DNS 切過去就結束。

```yaml
production_launch_gate:
  required:
    - approval_record_exists
    - backup_verified
    - restore_plan_exists
    - dns_ttl_ready
    - ssl_ready
    - smtp_test_passed
    - admin_login_test_passed
    - homepage_test_passed
    - form_submit_test_passed
    - checkout_test_passed
    - cache_purge_ready
    - rollback_plan_exists
    - monitoring_enabled
    - 24h_watch_window_enabled
```

禁止：

```yaml
production_forbidden:
  - direct_auto_deploy_without_approval
  - plugin_bulk_update_without_backup
  - database_destructive_change_without_review
  - payment_gateway_switch_without_manual_check
  - deleting_production_server_by_agent
```

---

# 20. Performance Budget

```yaml
PERFORMANCE_BUDGET:
  public_pages:
    ttfb_target: under_800ms_from_taiwan
    lcp_target: under_2_5s
    cls_target: under_0_1
    inp_target: under_200ms

  wordpress_admin:
    wp_admin_page_load_target: under_3s_to_5s
    product_edit_page_target: under_5s

  woocommerce:
    cart_page_target: under_2s_to_3s
    checkout_page_target: under_3s
    order_create_p95: under_2s
    failed_checkout_rate_alert: above_2_percent

  server:
    cpu_alert: above_80_percent_for_10min
    memory_alert: above_85_percent
    disk_alert: above_80_percent
    inode_alert: above_80_percent

  database:
    slow_query_threshold: 1s
    slow_query_log: enabled
    max_connections_alert: above_80_percent
```

---

# 21. Load Test / QA Test Policy

```yaml
LOAD_TEST_POLICY:
  starter:
    test_type: smoke_test_only
    required:
      - homepage_load
      - wp_admin_login
      - form_submit

  business:
    test_type: light_load_test
    concurrent_users: 20_to_50
    required:
      - homepage
      - key_landing_page
      - form_submit
      - admin_login

  commerce:
    test_type: checkout_flow_test
    concurrent_users: 50_to_100
    required:
      - product_page
      - cart
      - checkout
      - test_order
      - transactional_email

  premium:
    test_type: custom_load_test
    concurrent_users: defined_per_contract
    required:
      - full_user_journey
      - checkout
      - crm_capture
      - email_delivery
      - monitoring_watch
```

---

# 22. Monitoring / Incident

Hetzner Console 不夠，你需要 application-level observability。

```yaml
monitoring_stack:
  uptime:
    - Better Uptime
    - UptimeRobot
    - HetrixTools
  app_errors:
    - Sentry
  product_analytics:
    - PostHog
  server_metrics:
    - Netdata
    - Prometheus Node Exporter
    - Grafana Agent
  logs:
    - nginx
    - php_fpm
    - mysql
    - wordpress_debug_log
    - worker_logs
```

Incident 觸發源：

```yaml
incident_triggers:
  - uptime_down
  - deploy_failure
  - smoke_test_fail
  - wp_plugin_conflict
  - checkout_fail
  - email_delivery_fail
  - disk_usage_high
  - cpu_memory_high
  - ssl_expiring
  - backup_failed
  - abuse_notice_received
```

---

## 22.1 Incident Severity Matrix

```yaml
INCIDENT_SEVERITY_MATRIX:
  sev1_critical:
    examples:
      - production_site_down
      - checkout_down
      - payment_failure
      - data_loss
      - malware_confirmed
      - server_compromised
    response:
      notify: immediate
      owner_required: true
      client_notification: required
      postmortem: required

  sev2_high:
    examples:
      - wp_admin_down
      - email_delivery_failed
      - major_performance_degradation
      - backup_failed_for_2_days
      - ssl_expiring_under_3_days
    response:
      notify: same_day
      client_notification: depends_on_impact
      postmortem: optional

  sev3_medium:
    examples:
      - plugin_conflict_on_staging
      - non_critical_form_issue
      - disk_usage_warning
      - cache_issue
    response:
      notify: business_hours
      client_notification: not_required_unless_visible

  sev4_low:
    examples:
      - minor_warning
      - scheduled_update_needed
      - documentation_gap
    response:
      notify: weekly_queue
```

---

# 23. HA / Failover

單台 VPS 不是 HA。

## 23.1 最低標準

```yaml
availability_minimum:
  - daily_offsite_backup
  - restore_runbook
  - dns_failover_plan
  - spare_server_image
  - external_uptime_monitor
```

## 23.2 進階標準

```yaml
availability_better:
  - floating_ip
  - load_balancer
  - replicated_database
  - hot_standby
  - health_check
  - automated_failover_runbook
```

## 23.3 高價客戶

```yaml
premium_availability:
  - dedicated_vps_or_managed_wp
  - off_provider_backup
  - tested_restore
  - monitoring_sla
  - incident_response_policy
  - monthly_health_report
```

---

# 24. Migration / Exit Plan

不要讓系統綁死 Hetzner。當需求不適合 Hetzner 時，要能搬走。

```yaml
HETZNER_EXIT_PLAN:
  triggers:
    - latency_not_acceptable
    - client_requires_managed_wp
    - repeated_abuse_risk
    - cost_not_favorable
    - compliance_requirement
    - premium_sla_requirement

  destination_options:
    managed_wordpress:
      - kinsta
      - rocket_net
      - wp_engine
    asia_vps:
      - vultr_tokyo
      - digitalocean_singapore
      - linode_tokyo
    enterprise_cloud:
      - aws
      - gcp
      - azure

  migration_steps:
    - create_destination_environment
    - sync_files
    - export_database
    - import_database
    - update_wp_config
    - test_staging_url
    - run_smoke_tests
    - verify_smtp
    - verify_checkout
    - lower_dns_ttl
    - final_delta_sync
    - switch_dns
    - monitor_24h
    - keep_old_server_for_rollback_window

  rollback_window:
    default: 72h
    premium: 7_days
```

---

# 25. 合規與資料處理

如果你幫客戶做電商、CRM、表單、客服，一定會碰到個資。

每個客戶合約至少記錄：

```yaml
data_processing_terms:
  hosting_provider: Hetzner
  hosting_region: Singapore_or_Finland
  backup_location: specify
  subprocessors:
    - Hetzner
    - Cloudflare
    - SMTP_provider
    - analytics_provider
    - error_monitoring_provider
  client_responsibility:
    - privacy_policy_final_approval
    - cookie_policy_final_approval
    - legal_text_final_review
    - tax_or_regulatory_final_review
```

需要納入 Legal / Compliance OS：

```yaml
compliance_items:
  - Taiwan_PDPA
  - GDPR_if_EU_users
  - CCPA_if_US_California_users
  - PDPA_if_Singapore_users
  - DPA
  - privacy_policy
  - cookie_consent
  - subprocessors_list
  - data_retention_policy
```

---

# 26. Client Contract Addendum

以下是可放進合約或服務條款的初版文字。

```markdown
## Hosting Responsibility Addendum

1. Hosting Provider  
The website may be hosted on Hetzner, Cloudflare, or another approved infrastructure provider depending on the selected plan.

2. Managed Scope  
Our managed hosting service includes server setup, WordPress deployment, basic security hardening, backup configuration, uptime monitoring, and standard maintenance according to the selected service tier.

3. Exclusions  
The service does not guarantee protection against all attacks, third-party plugin vulnerabilities, client-caused configuration changes, unpaid third-party services, registrar issues, or force majeure events.

4. Backup and Restore  
Backups are performed according to the selected tier. Backup availability does not guarantee instant restoration. Restore time depends on site size, data integrity, and incident severity.

5. Email Delivery  
Transactional email must use an approved SMTP provider. Local server mail delivery is not supported for production.

6. Production Changes  
High-risk production changes require approval, including payment gateway changes, checkout changes, destructive database operations, DNS cutover, and major plugin updates.

7. Client Responsibility  
The client is responsible for approving legal text, privacy policy, cookie consent, payment provider configuration, tax settings, and business-specific compliance requirements.
```

---

# 27. Hetzner Production Policy v2

```yaml
HETZNER_PRODUCTION_POLICY_V2:
  regions:
    backend_control_plane: hel1
    asia_delivery_plane: sin

  usage:
    finland:
      public_runtime: false
      allowed:
        - admin_dashboard
        - n8n
        - worker
        - internal_api
        - reporting
        - decision_engine
        - backup_registry

    singapore:
      public_runtime: true
      allowed:
        - wordpress
        - woocommerce
        - client_portal
        - public_api
        - staging_sites
        - production_sites

  client_tiers:
    starter:
      isolation: shared_vps
      rto: 24h
      rpo: 24h
    business:
      isolation: dedicated_vps_per_client_or_project
      rto: 8h
      rpo: 24h
    commerce:
      isolation: dedicated_vps
      rto: 4h
      rpo: 6h_to_24h
    premium:
      isolation: dedicated_vps_or_managed_wp
      rto: 1h_to_4h
      rpo: 1h_to_6h

  billing:
    backup_payment_method: required
    invoice_monitoring: required
    unused_resource_cleanup: weekly
    resource_labels_required: true

  networking:
    cloudflare_required: true
    private_network_requires_tls: true
    ssh_via_vpn_or_zero_trust: true
    db_public_port: forbidden
    redis_public_port: forbidden

  security:
    root_login: disabled
    password_login: disabled
    ssh_key_only: true
    fail2ban: enabled
    unattended_security_updates: enabled
    wp_upload_php_execution: blocked
    malware_scan: scheduled
    2fa_for_admins: required

  backups:
    hetzner_backup: enabled
    pre_deploy_snapshot: required
    offsite_backup: required
    database_dump: daily
    wp_content_backup: daily
    restore_drill: monthly
    volume_backup_handled_separately: true

  wordpress:
    staging_first: required
    manifest_install: required
    production_installer: blocked_by_default
    smoke_tests: required
    smtp_test: required
    checkout_test: required
    update_policy: risk_based

  database:
    public_access: forbidden
    same_region_as_runtime: required
    slow_query_log: enabled
    daily_dump: required
    object_cache_for_woocommerce: required

  media:
    offsite_sync_for_business_plus: required
    object_storage_for_premium: preferred
    cdn: required

  email:
    local_sendmail: forbidden
    smtp_provider: required
    spf_dkim_dmarc: required

  automation:
    staging_auto_create: allowed
    staging_auto_delete_after_retention: allowed
    production_delete: blocked
    production_rebuild: blocked
    production_launch: approval_required
    agent_production_access: forbidden

  observability:
    uptime_monitoring: required
    sentry: required
    server_metrics: required
    backup_failure_alert: required
    ssl_expiry_alert: required
    disk_usage_alert: required

  compliance:
    dpa_required: true
    backup_location_documented: true
    subprocessors_documented: true
    privacy_policy_required: true

  incident:
    abuse_notice_runbook: required
    rollback_plan_required: true
    severity_matrix_required: true
    client_notification_rules_required: true

  exit_plan:
    migration_runbook_required: true
    rollback_window_default: 72h
```

---

# 28. 租用前 Checklist

```markdown
# HETZNER_RENTAL_CHECKLIST.md

## Account
- [ ] 不用 VPN 註冊
- [ ] 使用真實姓名或公司資料
- [ ] 使用穩定信箱，不用臨時信箱
- [ ] 付款資料與帳號資料一致
- [ ] 第一張帳單可準時付款
- [ ] 不在新帳號第一天大量開機器
- [ ] 不把唯一正式服務直接放在新帳號第一台機器

## Use Case
- [ ] 不做挖礦
- [ ] 不做 port scan / vulnerability scan
- [ ] 不做 spam / bulk email
- [ ] 不做 public proxy / VPN resale
- [ ] 不做高 abuse 風險服務
- [ ] 有 abuse complaint 處理流程

## Region
- [ ] 台灣 / 亞洲訪客 production 優先 Singapore
- [ ] 後台 / worker / admin 可放 Finland
- [ ] 不讓 public runtime 同步依賴 Finland
- [ ] 從台灣實測 latency
- [ ] 從台灣實測 throughput
- [ ] 確認 Singapore 流量額度與價格

## Billing
- [ ] 知道 server 關機仍計費
- [ ] 知道 Primary IPv4 可能另外計費
- [ ] 知道 unused IP / Volume / Snapshot 要刪
- [ ] 設定每週 unused resource cleanup
- [ ] 每個 resource 加 labels
- [ ] 每月檢查 client profitability

## Server
- [ ] 不用最低規格跑正式 WooCommerce
- [ ] Production 至少 2-4 vCPU / 4-8GB RAM 起
- [ ] Ecommerce production 建議 4+ vCPU / 8GB+ RAM
- [ ] Disk 預留 media / backup / logs 空間
- [ ] Production resource 開 deletion protection

## Security
- [ ] SSH key only
- [ ] root login disabled
- [ ] password login disabled
- [ ] Hetzner Cloud Firewall enabled
- [ ] OS firewall enabled
- [ ] 只開 80 / 443
- [ ] SSH 限定 IP / VPN / Zero Trust
- [ ] DB / Redis / n8n 不公開
- [ ] Cloudflare WAF + SSL Full Strict
- [ ] Admin routes 走 Zero Trust 或 VPN

## Backup
- [ ] Hetzner daily backup enabled
- [ ] Pre-deploy snapshot required
- [ ] WordPress DB dump daily
- [ ] wp-content daily backup
- [ ] offsite backup enabled
- [ ] volume backup 另外處理
- [ ] 每月至少一次 restore drill
- [ ] restore runbook 已寫好

## WordPress
- [ ] staging-first
- [ ] production installer blocked
- [ ] plugin/theme manifest versioned
- [ ] WP-CLI 可用
- [ ] smoke tests 可跑
- [ ] WooCommerce checkout 測試
- [ ] SMTP 測試
- [ ] cache / object cache 設定
- [ ] wp uploads 禁止執行 PHP
- [ ] admin 啟用 2FA

## Email
- [ ] 不依賴 local sendmail
- [ ] FluentSMTP + 外部 SMTP
- [ ] SPF / DKIM / DMARC 完成
- [ ] WooCommerce order email 測試
- [ ] password reset email 測試
- [ ] form notification 測試

## Observability
- [ ] uptime monitor
- [ ] Sentry
- [ ] server metrics
- [ ] log rotation
- [ ] disk usage alert
- [ ] SSL expiry alert
- [ ] backup failure alert
- [ ] abuse notice alert

## Automation
- [ ] Hetzner server_ref 寫入 environments
- [ ] provisioning log 入庫
- [ ] workflow run_id 入庫
- [ ] failure 進 incident / operator queue
- [ ] production launch 需要 approval
- [ ] agent 不可刪 production server
- [ ] agent 不可 rebuild production
```

---

# 29. Hosting Adapter 設計

不要讓系統綁死 Hetzner。

```ts
export interface HostingAdapter {
  createServer(input: CreateServerInput): Promise<ServerRef>;
  createStaging(input: CreateStagingInput): Promise<EnvironmentRef>;
  createSnapshot(serverRef: string): Promise<SnapshotRef>;
  restoreSnapshot(snapshotRef: string): Promise<void>;
  deleteEnvironment(environmentId: string): Promise<void>;
  getHealth(serverRef: string): Promise<HealthResult>;
  listResources(input: ListResourcesInput): Promise<HostingResource[]>;
  estimateCost(input: EstimateCostInput): Promise<CostEstimate>;
}
```

未來 provider：

```yaml
hosting_adapters:
  - hetzner
  - cloudways
  - kinsta
  - vultr
  - digitalocean
```

Hetzner 是主力，但不是命脈。

---

# 30. Cursor Prompt：實作 Hetzner Hosting Layer

```markdown
# TASK: Implement Hetzner Hosting Layer for Lobster Factory

You are implementing the Hetzner hosting layer for Lobster Factory.

## Context

Lobster Factory is a multi-tenant Agency OS / Client OS / Factory OS platform.

Hetzner is used as one hosting provider, not the only provider.

Current region policy:
- Finland / hel1 = backend control plane
- Singapore / sin = Asia delivery plane

## Goals

Implement a safe, observable, staging-first Hetzner hosting integration.

## Requirements

1. Create a HostingAdapter interface.
2. Implement HetznerHostingAdapter.
3. Support:
   - create server
   - create staging environment
   - create snapshot
   - restore snapshot
   - delete staging environment
   - get health
   - list resources
   - estimate monthly cost
4. Every resource must include labels:
   - organization_id
   - workspace_id
   - project_id
   - site_id
   - environment
   - cost_center
5. Production destructive actions must be blocked by default.
6. Staging auto-create is allowed.
7. Production launch requires approval.
8. API tokens must be separated:
   - staging token
   - production read/snapshot token
9. Never log secrets.
10. Write workflow run logs.

## Output files

Create or update:

- packages/hosting/src/HostingAdapter.ts
- packages/hosting/src/providers/hetzner/HetznerHostingAdapter.ts
- packages/hosting/src/providers/hetzner/types.ts
- packages/hosting/src/providers/hetzner/policy.ts
- packages/hosting/src/providers/hetzner/cost.ts
- packages/hosting/src/providers/hetzner/labels.ts
- packages/workflows/src/create-staging-environment.ts
- packages/workflows/src/create-production-snapshot.ts
- packages/policies/hosting/HETZNER_PRODUCTION_POLICY_V2.yaml
- docs/HETZNER_HOSTING_POLICY_COMPLETE.md

## Safety Rules

- Do not implement production delete.
- Do not implement production rebuild.
- Do not expose Hetzner API token.
- Do not allow agent production access.
- Do not allow launch without approval record.
- Do not assume backup equals restore success.

## Acceptance Criteria

- Can create a Singapore staging server.
- Can attach required labels.
- Can write environment record.
- Can create pre-deploy snapshot.
- Can block production destructive action.
- Can estimate monthly cost by site_id.
- Can generate a launch checklist.
- Can produce a rollback plan.
```

---

# 31. 建議文件拆分

未來可以拆成這些檔案：

```text
docs/hosting/
  HETZNER_HOSTING_POLICY_COMPLETE.md
  HETZNER_RENTAL_CHECKLIST.md
  HETZNER_PRODUCTION_POLICY_V2.yaml
  HETZNER_SERVER_BOOTSTRAP.md
  HETZNER_BACKUP_RESTORE_RUNBOOK.md
  HETZNER_INCIDENT_RUNBOOK.md
  HETZNER_ABUSE_NOTICE_RUNBOOK.md
  HETZNER_EXIT_PLAN.md
  CLIENT_HOSTING_TIERS.md
  WORDPRESS_UPDATE_POLICY.md
  PERFORMANCE_BUDGET.md
  HOSTING_CONTRACT_ADDENDUM.md
```

---

# 32. 最終建議

```yaml
final_recommendation:
  keep_hetzner: true

  finland:
    use_for:
      - backend
      - agency_admin
      - automation
      - n8n
      - worker
      - reporting
      - backup_registry

  singapore:
    use_for:
      - wordpress
      - woocommerce
      - client_facing_platform
      - staging
      - production_delivery

  must_not_skip:
    - cloudflare
    - ssh_hardening
    - firewall
    - offsite_backup
    - restore_drill
    - smtp_provider
    - monitoring
    - staging_first
    - production_approval
    - cost_labels
    - abuse_runbook
    - hosting_adapter_abstraction
```

---

# 33. 還差的最後 5%

這份文件已經可以作為 production-grade draft。最後 5% 需要實測資料補上：

```yaml
remaining_real_world_data:
  - 台灣不同 ISP 到 Hetzner Singapore 的 latency
  - 台灣不同 ISP 到 Hetzner Singapore 的 throughput
  - 實際 WooCommerce checkout 壓測結果
  - 實際 restore time
  - 實際每站成本
  - 實際 backup storage 成本
  - 實際 incident response time
  - 實際客戶方案定價
```

這些不能靠文件猜，要等你跑幾個站後補成 benchmark。

---

# 34. Source Links

> 這份文件整合自使用者提供的兩份 Hetzner / WordPress 工廠化注意事項與租用前檢查資料，並延伸為 Lobster Factory production-grade hosting standard。

主要外部來源：
- Hetzner Locations: https://docs.hetzner.com/cloud/general/locations/
- Hetzner Billing FAQ: https://docs.hetzner.com/cloud/billing/faq/
- Hetzner Traffic: https://docs.hetzner.com/robot/general/traffic/
- Hetzner Cloud Firewalls: https://docs.hetzner.com/cloud/firewalls/overview/
- Hetzner Backups / Snapshots: https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/
- Hetzner Server FAQ: https://docs.hetzner.com/cloud/servers/faq/
- Hetzner Cloud API: https://docs.hetzner.cloud/reference/cloud
- Hetzner Cloud Service Agreement: https://www.hetzner.com/legal/cloud-server/
- Hetzner Data Protection: https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/


---

# Z. Source Register

## Z.1 Hetzner official docs

```yaml
hetzner_official_sources:
  locations: https://docs.hetzner.com/cloud/general/locations/
  backups_snapshots_overview: https://docs.hetzner.com/cloud/servers/backups-snapshots/overview/
  backups_snapshots_faq: https://docs.hetzner.com/cloud/servers/backups-snapshots/faq/
  cloud_firewall_faq: https://docs.hetzner.com/cloud/firewalls/faq/
  cloud_servers_faq: https://docs.hetzner.com/cloud/servers/faq/
  networks_faq: https://docs.hetzner.com/networking/networks/faq/
  primary_ips_faq: https://docs.hetzner.com/cloud/servers/primary-ips/faq/
  floating_ips_overview: https://docs.hetzner.com/cloud/floating-ips/overview/
  load_balancer_faq: https://docs.hetzner.com/networking/load-balancers/faq/
  data_protection: https://docs.hetzner.com/general/company-and-policy/data-protection-at-hetzner/
  account_getting_started: https://docs.hetzner.com/general/billing-and-account-management/account-getting-started/
  fraud_prevention: https://docs.hetzner.com/general/security-and-identify/fraud-prevention-faq/
  payment_overview: https://docs.hetzner.com/general/billing-and-account-management/billing-at-hetzner/payment-overview/
  cancellation_overview: https://docs.hetzner.com/general/billing-and-account-management/cancellation/cancellations-overview/
  two_factor_authentication: https://docs.hetzner.com/general/security-and-identify/two-factor-authentication/
  price_adjustment: https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/
```

## Z.2 Hetzner Community tutorials

```yaml
hetzner_community_sources:
  wordpress_docker_compose: https://community.hetzner.com/tutorials/run-wordpress-in-a-container-using-docker-compose/
  wordpress_cyberpanel_openlitespeed: https://community.hetzner.com/tutorials/how-to-install-wordpress-with-cyberpanel-openlitespeed-on-ubuntu-20.04.4-LTS/
  nginx_proxy_manager: https://community.hetzner.com/tutorials/installing-nginx-proxy-manager/
  easypanel_paas: https://community.hetzner.com/tutorials/build-your-own-paas-with-hetzner-cloud/
```

---

# Z.3 Version History

```yaml
version_history:
  2.0.0:
    status: production_grade_hosting_standard_draft
    based_on:
      - user_notes
      - Lobster_Factory_architecture
      - initial_Hetzner_docs_research
  2.1.0:
    status: official_source_audited_draft
    added:
      - official_source_audit
      - community_tutorial_notes
      - verified_vs_inference_matrix
      - field_test_plan
      - api_iac_implementation_requirements
      - runbook_acceptance_criteria
      - cursor_implementation_pack_v2
```
