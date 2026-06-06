# PLAN：客戶主機「開機後全棧部署 + 維護」層（provider 無關）

> **狀態**：規劃中（未實作）。R0 架構計畫，等批准才動 code。
> **前情**：機層「租 Hetzner + day-1 硬化 + DNS」已完成+真機驗證（見 `HETZNER_PROVISIONING_HANDBOOK.md`）。
> **本計畫補的缺口**：把新機（或客戶自帶機）**自動部署成跟 production 一樣全副武裝** —— Docker + observability(Grafana+Loki+Netdata+Sentry+Uptime) + 快取加速 + swap + 備份 + 限速/WAF/fail2ban。
> **作者**：AwareWave 全能工程師。**建立日**：2026-06-06。

---

## [任務理解]
根本問題：目前自動化只開出「**安全的空機**」（防火牆/SSH/重開機硬化）。但 production 那 2 台（SG/EU）有一整套**持續維護 + observability + 加速**，新機完全沒有。要讓「一鍵架站」開出來的機**等同 production 等級維護**。
**新增硬需求（2026-06-06）**：**客戶主機不一定是 Hetzner，可能別家（Vultr/DO/客戶自帶）**。→ 部署層**必須 provider 無關**，只靠 SSH 對任何 Linux 機運作。

---

## [現況分析]（agent 全盤盤點，file:line 證據；**90%+ 料件現成可復用**）

### 料件全在 `lobster-factory/infra/hetzner-phase1-core/`（除非註明）

| 類別 | 現成資產 | 復用 |
|---|---|---|
| **主 stack** | `docker-compose.yml`（nginx/redis/wordpress/mariadb/node-api/next-admin；n8n profile-gated） | ✅ 改 `.env` 即用 |
| staging override | `docker-compose.staging.yml`（隔離 port/name/tag） | ✅ |
| **observability** | `docker-compose.observability.yml`（Loki 2.9.4 + Promtail + Grafana 10.4.3，loopback 綁定）+ `observability/{loki-config,promtail-config,grafana/provisioning,5 dashboards}` | ✅ |
| 附屬 stacks | `infra/{n8n,supabase,trigger}/docker-compose.yml` | ✅（EU 專屬） |
| **加速** | Redis（256MB LRU，compose:48-65）、`nginx/cloudflare-real-ip.conf`（CF CDN real-ip）、`nginx/aware-wave-security.conf`（限速 30req/s→429）| ✅ |
| mem 上限 | compose 各 service `deploy.resources.limits`（4G/8G 已調校） | ✅ |
| **swap** | ⚠️ **無腳本**（502 OOM 後手動加、未文檔化）；`diagnose-host-resources.sh` 只讀檢查 | ❌ 需建 |
| **監控配置** | `netdata/health.d/aware-wave.conf`（redis/nginx 5xx/4xx 告警）；Sentry 走 `.env` DSN；Uptime Kuma=外部/SaaS（架構待確認） | ✅ netdata / ❓ kuma |
| **備份** | `scripts/backup-phase1.sh`（WP DB+uploads+n8n vol）+ `verify-backup.sh` + `setup-offsite-backup.sh`（rclone+Hetzner Object Storage） | ✅ |
| **維護 cron** | `scripts/install-maintenance-crons.sh`（冪等，host 偵測，裝 backup/verify/cleanup cron） | ✅ |
| **安全** | `nginx/system-sites/scanner-block.inc`（2層掃描器攔截+獨立 log）、`fail2ban/jail.d/99-awarewave.conf`+`filter.d/`、`auto-reboot/52awarewave-auto-reboot.conf` | ✅ |
| 部署腳本 | `scripts/sg-deploy.sh`（git→rsync→compose build/up，含 test/health/smoke/rollback gate）、`deploy-observability-vps.sh`、`rollback-phase1.sh` | ✅ |
| 文件 | `LONG_TERM_OPS.md`、`MAINTENANCE_CALENDAR.md`、`README.md`、`BACKUP_RESTORE_PROOF.md` | 📖 |

### 唯一缺口（agent 確認）
**沒有單一「從零 bootstrap 一台新機」的編排腳本**（`bootstrap-from-zero.sh` 不存在）。production 當初是**半手動**（手動 git clone + cp .env + 逐個跑腳本）。現有腳本全是模組化、冪等、可復用 —— **缺的只是把它們串起來的編排層**。

### 既有機層（已完成，可接）
`packages/workflows/src/hosting/` 的 `ServerProvisionAdapter` 已是**可換 provider 抽象**（hetzner_cloud 已實作+真機驗）。`provisionClient()` 是 SSOT 編排器。

---

## [風險檢查]
1. **重工風險**：料件全現成 → 若不復用而重寫 = 違反 R0。**必須編排既有腳本，不重造**。
2. **provider 鎖定**：若 bootstrap 寫死 Hetzner 假設（cloud-init/Hetzner API）→ 別家機/客戶自帶機用不了。**必須純 SSH + 通用 Linux**。
3. **硬化重複**：cloud-init（Hetzner 開機時）已做防火牆/SSH 硬化；但**客戶自帶機沒經過 cloud-init** → bootstrap 必須也能套同一套硬化（否則別家機沒防火牆）。
4. **冪等**：bootstrap 可能重跑（部分失敗重試）→ 每步必須冪等（既有腳本已是）。
5. **機密**：`.env` 含 DB 密碼/API key → 不可入 git、不可 log；走 vault/SSH 注入。
6. **破壞性**：在客戶**既有**機跑 bootstrap 可能覆蓋他現有設定 → BYO 模式需 dry-run + 明確確認。
7. **SG/EU 差異**：host 偵測（hostname）對新機/別家機失效 → 必須顯式 `--host` / `--role` 參數。

---

## [可選方案]

**A. 單一大 `bootstrap-from-zero.sh`**：一支腳本做完所有（裝 docker→部署→硬化→監控→備份）。
- 優：一個入口。缺：難測、難局部重跑、巨石。

**B. 薄編排器 + 復用既有模組腳本（建議）**：頂層 `provision-stack.sh` 依序呼叫既有模組（base-install / harden / deploy-compose / observability / maintenance-crons / offsite-backup），每步冪等可獨立跑。
- 優：最大復用、可局部重跑、好測、貼既有慣例。缺：要寫一個編排器 + 抽出共用硬化。

**C. Ansible playbook**：用 Ansible 管 bootstrap（V2 policy 曾建議）。
- 優：宣告式、冪等內建、業界標準。缺：新依賴+學習曲線；既有全是 bash，等於再包一層。

---

## [建議方案]：B（薄編排器 + 復用既有），保留 C 升級路

**核心架構：分兩層，machine 層 provider-specific、bootstrap 層 provider-agnostic**
```
[機層 — provider specific]   租一台機 / 客戶自帶
  ├─ hetzner_cloud adapter（已完成）
  ├─ vultr / digitalocean adapter（未來，同 ServerProvisionAdapter 契約）
  └─ byo adapter（新增：客戶自帶機，不開機只收 sshHost）
         ↓ 產出 { sshHost, sshCredentialsRef }
[bootstrap 層 — provider AGNOSTIC]   純 SSH 對任何 Linux 機
  provision-stack.sh（新編排器）依序冪等呼叫既有模組：
    1. base-install     apt: docker/git/rclone/fail2ban/netdata（缺什麼裝什麼）
    2. harden           防火牆 v4+v6/SSH/swap/sysctl（**客戶自帶機也套**；抽 cloud-init 同款邏輯）
    3. deploy-stack     既有 sg-deploy.sh 模式：rsync repo → docker compose build/up（依 --role 選 compose）
    4. observability    既有 deploy-observability-vps.sh（Loki+Promtail+Grafana+netdata health.d）
    5. maintenance      既有 install-maintenance-crons.sh（backup/verify/cleanup cron）
    6. offsite-backup   既有 setup-offsite-backup.sh（rclone）
    7. security         cp nginx 限速/scanner-block + fail2ban jail + auto-reboot conf
    8. verify           health check / curl smoke / 備份試跑
```

**理由（R0 五準則）**：
- **零重工**：8 步全是呼叫**既有**腳本/配置，只新增一個編排器 + 一個共用硬化抽取。
- **provider 無關**：bootstrap 只需 `sshHost + key`，不碰任何 Hetzner API → Vultr/DO/客戶自帶機通用。
- **最小爆炸半徑**：每步冪等可獨立跑；env-gate + dry-run；BYO 模式先 dry-run。
- **可擴充刪減**：要加 stack 加一步、客戶不要 observability 就跳過該步（`--skip observability`）。
- **30 年**：bash + 既有腳本，無新框架依賴；未來真要 Ansible 化，把編排器換成 playbook、模組不動。

**新增的「客戶自帶機」(BYO) 流程**：`provisionClient` 加 `byo` adapter mode → 跳過開機、直接拿客戶 SSH 資訊 → 進同一個 bootstrap 層。客戶在 Hetzner / Vultr / DO / 自己機房都一樣。

---

## [實作計畫]（分階段，每階段可驗證，env-gate / dry-run 預設安全）

**P1 — 共用硬化抽取（讓 cloud-init 與 bootstrap 共用一套）**
- 把 `cloudInit.ts` 的硬化規則抽成一份**純 shell** `harden-server.sh`（firewall v4+v6/SSH drop-in/fail2ban/auto-reboot/sysctl/**swap**）。cloud-init 與 bootstrap 都呼叫它 → 單一 SSOT，Hetzner 機與客戶自帶機硬化一致。
- **新增 swap**（缺口）：`harden-server.sh` 內 `fallocate /swapfile`（依 RAM 算大小）+ sysctl swappiness。

**P2 — bootstrap 編排器**
- 新 `infra/hetzner-phase1-core/scripts/provision-stack.sh`：8 步編排，參數 `--role {wp|control|observability-only}`、`--skip`、`--dry-run`、`--host {sg|eu|new}`。純呼叫既有腳本。
- 在控制平面（或 Trigger）以 SSH 對目標機執行（用 `provisionClient` 產出的 sshHost/key）。

**P3 — BYO（客戶自帶機）adapter**
- `serverAdapterFactory` 加 `byo` mode：input 含 `sshHost`/`sshCredentialsRef`，`provisionServer` 回 `{outcome:"provisioned", ref}`（不呼叫任何雲 API）。→ 任何 provider 的機都進同一 bootstrap。

**P4 — 接進 provisionClient**
- `provisionClient` 在拿到 server ref 後，多一步「呼叫 bootstrap 層」（可注入、可 env-gate `LOBSTER_BOOTSTRAP_ENABLED`）。site 層 WP install 併入。

**P5 — 真機端到端驗收**（隔離 project，~€0.01）
- 開 cpx12 → provisionClient → bootstrap 全 8 步 → 驗 Grafana/Loki/Netdata 起來、備份 cron 在、限速生效、swap 在 → 銷毀。
- BYO 驗：拿一台已存在的測試機（非 Hetzner 模擬）跑 bootstrap。

---

## [驗證計畫]
- **單元**：編排器/BYO adapter 邏輯（mock SSH）→ vitest。`harden-server.sh` → `bash -n` + shellcheck。
- **真機（每階段）**：SSH 驗各步產物（`docker ps` 看 stack、`curl 127.0.0.1:3009` Grafana、`crontab -l`/`/etc/cron.d` 看備份、`swapon --show`、`iptables -S` v4+v6、`fail2ban-client status`）。
- **冪等**：同機重跑 bootstrap → 無重複、無破壞。
- **BYO/別家**：在非 Hetzner 機跑 → 確認不依賴任何 Hetzner-specific。
- 每階段 R0 四動作寫 WORKLOG（REALTEST_EVIDENCE/REVIEW_DONE/BUGHUNT_DONE）。

## [Rollback]
- 全 env-gate（`LOBSTER_BOOTSTRAP_ENABLED` 預設 OFF）→ 不啟用＝現況不變。
- 既有 `rollback-phase1.sh`（image save/restore）。
- BYO 在客戶機：先 dry-run + 備份客戶現有 `.env`/nginx 設定，失敗可還原。
- 新檔全 additive；編排器只「呼叫」既有腳本，不改它們。

---

## 與既有文件關係
- 機層：`HETZNER_PROVISIONING_HANDBOOK.md` / `HETZNER_HOSTING_LAYER_PLAN.md`
- 本計畫 = 機層**之後**的 stack 部署層（provider 無關）
- 嵌進 app：`EMBED_PROVISION_INTO_APP.md`（bootstrap 也經 provisionClient → 同樣零重寫嵌入）
