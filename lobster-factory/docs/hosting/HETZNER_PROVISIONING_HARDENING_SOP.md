# Hetzner 架站硬化 SOP（注意事項 + 機制對照 + Open-Gaps）

> **角色**：Hetzner 主機 provisioning 自動化的**戰術驗收 SSOT**。每條 = automation 必過的 gate。
> 每條附**真實事故 file:line 證據**（事故換來的，不是理論）。
> **配套**：策略政策層見 [HETZNER_HOSTING_POLICY_COMPLETE_V2.md](HETZNER_HOSTING_POLICY_COMPLETE_V2.md)；實作計畫見 [HETZNER_HOSTING_LAYER_PLAN.md](HETZNER_HOSTING_LAYER_PLAN.md)。
> **層次**：本檔 = 深（戰術，事故實證）；V2 政策 = 廣（策略，官方稽核）。兩者互補。

---

## 0. 一句話

Hetzner 是**高 CP 值 unmanaged 主機，不是 managed WordPress**。以下 19 條硬化基線必須在**開機當下（day-1）內建**，否則每開一台新機就重蹈覆轍。全部來自真實踩過的坑。

---

## A. 安全（挖礦入侵 2026-04-20 根因）

> 來源：[runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md](../../../runbooks/HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md)

1. **預設密碼一個都不能留** — Postgres/MinIO/Redis/n8n 開機即改。挖礦根因 = Supabase 預設 `your-super-secret-and-long-postgres-password` 從未改（runbook:18）。per-租戶生成後存 vault。
2. **DB port 永不對外** — 5432/5433/6543/3306/27017 一律 `127.0.0.1:` 綁定（runbook:63-72）。
3. **Docker 繞過 UFW 是盲點** — 必須 `DOCKER-USER` chain 雙層防護（runbook:110-148）。Docker 綁 `0.0.0.0:PORT` 直接寫 iptables DOCKER chain → UFW INPUT 規則**完全無效**（顯示 deny 實際對外開）。
4. **iptables INPUT default DROP**，只開 22/80/443（runbook:139-148）。
5. **SSH key-only，禁密碼登入**（root login disabled、password auth disabled）。

## B. 記憶體 / OOM（ClickHouse OOM + 502）

> 來源：[runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md](../../../runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md)

6. **每容器 `mem_limit` + 服務內記憶體上限** — ClickHouse 無上限撐爆 swap → OOM Killer 殺容器 → Cloudflare✅ Host❌ 502（playbook:117-129）。
7. **system log 表 TTL 必設** — 40+ 系統表堆積資料無法清除是 OOM 根因。
8. **swap + Netdata 閾值告警**（CPU>80% 持續 5 分鐘）。

## C. Nginx / 限速（502 + scanner flood 2026-05-22）

> 來源：WORKLOG 2026-05-22 D1-D5

9. **`limit_req_zone` 定義了必須在 server block 加 `limit_req`** — 定義不套用 = 限速完全無效。150 並發 burst 503 從修前 41 個→修後 0 個。
10. **`scanner-block.inc` 攔 13 種掃描路徑 + 獨立 log** — 不污染 access.log = Netdata 不誤告警。
11. **不留 stock default site**（無限速的 port 80 default）。

## D. TLS（certbot 自動續期壞 2026-05-25）

> 來源：WORKLOG 2026-05-25

12. **DNS-01（Cloudflare API）不用 HTTP-01** — host nginx 沒綁 port 80（Docker 佔用）→ HTTP-01 驗證從未生效、自動續期壞。
13. **cert 續期實測 `renew --dry-run`**，不假設會自動跑。

## E. 部署（auto-deploy 連敗 36h 2026-04-27~05-08）

14. **build artifact（tsbuildinfo）不進 git** — 被 git 追蹤 → VPS build 重生 → `git pull --ff-only` 因 dirty tree 失敗 → 10 天卡部署。
15. **git→staging 用 rsync 不用 git pull**，`--exclude .env*`。
16. **deploy 內建 test gate + healthcheck + smoke + 自動 rollback**（已有 `sg-deploy.sh`）。

## F. DB schema（webhook 全斷 2.3h 2026-06-04）

17. **migration 後必 `NOTIFY pgrst, 'reload schema'`** — function 存在但 PostgREST schema cache 未刷新（PGRST202）→ 線上 webhook 全斷 2.3 小時。

## G. 維運 / 逃生

18. **unattended-upgrades + 自動 reboot**（SG 20:00 / EU 20:30 UTC stagger，`52/53awarewave-auto-reboot.conf`）。
19. **SSH 壞掉逃生路徑** — 保留 Hetzner API token + server ID（reset_password / rescue mode 60 分窗口 / VNC base64 寫 key，502-playbook:51-99）。

---

## 機制對照表（坑 → 已做成的機制）

| 類別 | 既有機制（可復用） |
|------|------------------|
| 部署 | `/sg-deploy` `/check-drift` slash cmd；`sg-deploy.sh` `check-drift-and-alert.sh` |
| 健康/監控 | `/health` `/smoke-test` `/signals`；`endpoint-alert.sh`（systemd timer）；Netdata |
| 安全/vault | `/vault-status` `/vault-sync`；`secrets-vault.ps1`；`sync-*.ps1`（vault→/etc/default） |
| VPS 維運 | `/sg-reboot` `/eu-reboot` `/auto-reboot-status`；`52/53 auto-reboot.conf` |
| 備份 | `backup-phase1.sh` + `verify-backup.sh`（cron 02:00/02:30 UTC + offsite rclone） |
| 維護 cron | `install-maintenance-crons.sh`（冪等 + host 偵測） |
| Agent | `devops-engineer` `incident-responder` `critic` `db-expert` `debugger` |
| 防呆 Hook | `high-risk-bash-warn` `git-log-injector` `auto-repair-guard` `verify-gate-*` |
| Runbook | 10 本（502/OOM、挖礦、WAF、reboot、Telegram、Kuma、Trigger-BFM…） |

---

## Open-Gaps Register（還沒處理好的，狀態 SSOT = AUDIT_REGISTRY.md）

| 項目 | 狀態 | 位置 |
|------|------|------|
| 一鍵架站骨幹 9 Major + 11 Minor | 🔴 OPEN（M9/M7/M10/M3 致命） | `packages/workflows/src/` |
| └ M9 中途失敗無 rollback → 孤兒站 | 🔴 | `orchestrate-tenant-provisioning.ts:83-115` |
| └ M7 spawn 繼承 process.env 含 secrets | 🔴 | `installManifestStaging.ts:99-106` |
| └ M10 dispatch 非原子 → 重複 | 🔴 | `dispatch-action-run.ts:134-153` |
| └ M3 dry-run 偽報 completed | 🔴 | `wp-install-plugins.ts:191-226` |
| C1/C3/M6/M8 | ✅ 已修（9b27506） | 同上 package |
| Repair Center M2(無 per-source HMAC)/M4(fingerprint 偽造) | 🟠 OPEN | next-admin |
| **Hetzner 開機層** | ⚠️ 不存在（greenfield） | 見 PLAN D3 |
| AutoRepair Phase 4 GitHub App | ⏳ 未裝 | — |
| Certbot 到期監控 | ⏳ 手動 | — |

---

## 官方查證硬限制（會讓自動化直接失敗，必避）

> 詳見 PLAN 附錄 A（含 API endpoint / payload / 來源 URL）

1. **cx22/cx32/cx42/cx52 已停售**（2026-01-01）→ Singapore 用 **cpx 系列(AMD)**；runtime `GET /v1/server_types?location=sin` 確認。
2. **Hetzner token 無細粒度權限**（只 project 層 Read/Read+Write）→ staging/prod **各開一 project**。
3. **user_data ≤32KiB + 機上免授權可讀** → cloud-init 絕不放機密。
4. **Primary IPv4 刪 server 不連帶刪**（€0.50/月孤兒）→ teardown 顯式 `DELETE /v1/primary_ips/{id}`。
5. **Resend SMTP 官方 465，但 Hetzner 封 25/465** → 改 **port 587/STARTTLS**。
6. **Firewall outbound 加一條 = 全擋**；inbound 隱含 deny。
