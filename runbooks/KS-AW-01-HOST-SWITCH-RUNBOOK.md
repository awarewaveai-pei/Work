# ks-aw-01 換機 Runbook + 計劃書（整併後單機時代的主機轉移唯一正本）

> **建立 2026-08-28**，由當日完成的三機整併（SG+EU+Hostinger → ks-aw-01）實戰驗證中提煉。
> 本文件是「操作者月租退出權」的執行載體：發現更便宜／更符合規格地板的機器
> （例：**KS-6 $59.80/mo 128GB ECC 2×1TB**、KS-7、Hetzner auction 合規機）時，
> 照本文件把 ks-aw-01 整機搬過去。
>
> **決策鏈**：[`2026-08-17-dedicated-host-spec-upgrade.md`](../agency-os/reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md)
> （規格地板 128GB ECC/1TB）→ [`2026-08-18-dedicated-host-purchase-timing.md`](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md)
> （立刻買＋月租退出權；其「soulful 落地後切換窗已關」條款由本文件**接棒**：窗沒有關，
> 只是換機成本從「重跑建置」變成「整機轉移」，本文件就是那個成本的定價與執行手冊）。
> **拓樸事實正本**：[`AWAREWAVE_STACK_QUICKREF.md`](../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。
> 舊時代（EU/SG 分立）遷移正本 [`HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md) 保留為歷史與備份/還原章節引用。

---

## §0 計劃書：什麼時候換、什麼時候不換

### Go 條件（全部滿足才啟動）

| # | 條件 | 依據 |
|---|------|------|
| G1 | 新機規格 ≥ 硬門檻：**ECC RAM**、≥64GB（目標 128GB 恢復規格地板）、≥2×1TB NVMe 可組 RAID1、≥8C16T | spec-upgrade 決策 P1.2；ECC「是門檻不是偏好」 |
| G2 | 經濟：月費比現役 **便宜 ≥$10/mo**，或 **≤+$5/mo 換到 128GB/2TB**（恢復地板視同賺） | KS-6 $59.80 vs SYS-GAME-2 $72 = 省 $12.2 且 RAM×2 → 兩條都中 |
| G3 | 無 14 天內的客戶死線／未結案 incident；`capacity-LATEST` 非 🔴 | 最小爆炸半徑 |
| G4 | 距上次換機 ≥30 天（防 churn）。**例外二條**：① 現役機硬體故障 ② **首個付費月內（≤ 2026-09-26）出現地板恢復型更便宜機（KS-6/KS-7）** —— 月租退出權買的就是這個，首月內切換重疊損失趨零 | 30 年紀律 + timing 決策文件 |
| G5 | 三條備份管線最近一次 **cron 自動跑** 全 PASS 且 R2 verify 過 | 換機唯一安全網 |

### 成本帳（用真實數字，不憑感覺）

- **人力**：Phase 1 預備約 2–3 小時（零停機、可分日做）；Phase 2 切換窗合計 **~40 分鐘停機分片**（整併日實測：Kuma 3 分、MainWP 5 分、Supabase 群 6 分、Trigger 8 分、SG 群 9 分、soulful 5 分）；Phase 3 驗證 1 小時。
- **金錢**：OVH eco 月租預付、無按日退費；**扣款週年日 = 每月 26 日**（2026-08-26 購機，操作者確認）。最佳窗口：**任一已付月內完成切換並在 26 日前退訂**，現役機月費零重疊；額外成本只剩新機裝機費（KS-6 約 $43.2）+ 新機首月。
- **回本**：以 KS-6 計 $12.2/mo 省幅：週年日前切完 = **裝機費 ~3.5 個月回本**；最差（整月重疊）~6 個月。規格地板恢復（64→128GB、0.96→2TB）的價值決策文件已認定高於價差。
- **誰盯貨：**KS-6/KS-7 常缺貨。操作者見到有貨可隨時下單（月租）再告知執行本 runbook；自動化盯貨（OVH availability API 接 AO-RESUME warn-only）列 TASKS 待辦，非前置條件。

### No-Go / 中止

- 新機 rescue mode 實測失敗、RAID 未 `[UU]`、或 `nvme smart-log percentage_used ≥40%`（二手機）→ 退貨換機，不硬上。
- Phase 2 任一群驗證失敗 → 該群 DNS 切回舊機（見 §7），其餘群不受影響。

---

## §1 事實清單（換機當天的完整變數盤點；`NEW_IP` = 新機 IP）

> 每一項都是 2026-08-28 整併完成態的實查結果。換機前重新核對一次
> （指令：`sudo docker ps -a`、`docker volume ls`、`ls /etc/nginx/sites-enabled`），
> 有出入以機器為準並回寫本節。

### 1a. 服務群與目錄（rsync 對象）

| 群 | 目錄 | 具名 volumes |
|----|------|--------------|
| Supabase(11 容器) | `/root/supabase/`（**含 PGDATA bind：`volumes/db/data`**）| `supabase_db-config` `supabase_deno-cache` `supabase_storage-data` |
| Trigger.dev(9+buildkit) | `/root/trigger/`（**含 `clickhouse/override.xml` 記憶體預算，原樣帶走**）| `trigger_trigger_{clickhouse,minio,pg,redis}_data` `trigger_trigger_shared` `buildx_buildkit_trigger0_state` |
| n8n | `/root/n8n/` | `n8n_n8n_data` |
| Postiz | `/root/postiz/`（DB 在 supabase-db，同窗切）| `postiz_postiz_uploads` |
| MainWP | `/root/mainwp/` | `mainwp_mainwp_db` `mainwp_mainwp_files` |
| Uptime Kuma | `/root/uptime-kuma/`（compose 化 2026-08-28）| `uptime-kuma` |
| Render 雙服務 | `/root/render-services/`（compose + 兩個 `.env`，600）| 無（無狀態，產出上 R2）|
| SG 棧(nginx/WP/api/admin/redis/觀測) | `/root/lobster-phase1/`（**exclude `backups/`**；`.env` 是機器設定 SSOT）| `lobster-phase1_{wordpress_data,wordpress_db_data,redis_data,loki_data,grafana_obs_data}` |
| Oracle | `/opt/oracle/Projects/internal/ziwei-doushu/` | 無 |
| soulful | `/root/soulful/` | soulful 三容器之 volumes（`docker volume ls | grep soulful` 現查）|
| 工具/備份腳本 | `/root/scripts/` `/root/Work/`（git clone，deploy key）`/root/backups*`（可不搬，R2 為準）| — |

### 1b. 本地 build 的 images（`docker save | gzip | ssh | docker load`，**不重建**）

`lobster-phase1-wordpress:local`、`lobster-phase1-node-api:local`、`lobster-phase1-next-admin:local`、`oracle-web:latest`、`lobster-remotion-service:local`、`lobster-video-service:local`、（soulful-wp 若為本地 build 一併 save）

### 1c. 🔴 匿名卷（整併日踩過的坑：漏拷 = Trigger 全掛 4 小時）

```bash
# 在舊機列出「容器 → 匿名卷」對映，逐一列入拷貝清單：
for c in $(sudo docker ps -a --format '{{.Names}}'); do sudo docker inspect $c \
  --format '{{range .Mounts}}{{if eq .Type "volume"}}{{.Name}} '$c' {{.Destination}}{{println}}{{end}}{{end}}'; \
done | grep -E '^[0-9a-f]{64}'
# 已知必有：trigger-registry → /var/lib/registry（deployed task images 的家）
```

### 1d. 系統層（rsync/重建對象）

- `/etc/nginx/sites-available/`（11 檔，**從 sites-available 拿真檔，sites-enabled 是 symlink** — 整併日坑）＋ `conf.d/{soulful-security,soulful-cache,rate-limit-zones,cf-edge-geo}.conf`＋`snippets/cf-only.conf`
- `/etc/letsencrypt/` 整棵：`archive/ live/ renewal/ accounts/` **加 `options-ssl-nginx.conf` `ssl-dhparams.pem`**（整併日坑：漏這兩檔 nginx -t 直接炸）；renewal conf 的 `account` 已統一單一帳號 ✓
- `/etc/hosts` 的 `127.0.0.1 registry` 行 + `/etc/docker/daemon.json` 的 `insecure-registries:["registry:5000"]`（整併日坑；改完 `kill -HUP dockerd` 免重啟）
- root crontab（11 行）＋ `/etc/cron.d/{lobster-backup,ks-stack-backup,ks-aw-01-backup}` ＋ `/etc/default/{eu-backup,awarewave-endpoint-alert*}`（600）＋ systemd `awarewave-endpoint-alert.{service,timer}`
- `/root/.ssh/`：`soulful_pull`（Hostinger 觀察期內）、`work_deploy`（GitHub deploy key）＋ `config` alias

### 1e. DNS（Cloudflare，PATCH `content` → NEW_IP；record id 現查 `GET /zones/<zone>/dns_records`）

- zone `f21b1919632fee2221647908a94fdcac`（aware-wave.com）：**13 筆 A**（apex/api/app/oracle/mainwp/n8n/postiz/studio/supabase/trigger/uptime = proxied🟠；`remotion-svc`/`video-svc` = **DNS-only⚪ 勿開 proxy**）＋ `ks-aw-01` A（DNS-only，rDNS 配對用 → 同步改）＋ www CNAME 不動
- zone `bb1358fe8d3e1d73c822bdb31d3cd823`（soulfulexpression.org）：apex A（record `5287ae0edbce87ec8a9fa6152e05e220`，proxied🟠）

### 1f. Cloudflare / OVH 邊緣層（新機必補，整併日兩個坑都在這）

1. **兩個 zone 各加 IP Access whitelist**：NEW_IP（target=`ip`）**和 NEW_IP 的 IPv6 /64（target=`ip_range`，不是 `ip6`）** —— 整併日坑：只加 v4，主機自打自家網域走 v6 被 CF challenge 403，容器純 v4 掩蓋了問題
2. **OVH Edge Network Firewall**（若新機仍 OVH；經 Manager **Cloud Shell** `ovhcloud` CLI，UI hitbox 不可靠）：
   ```
   ovhcloud ip firewall add NEW_IP/32 NEW_IP
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 0 --action permit --protocol tcp --tcp-option established
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 1 --action permit --protocol udp --source-port 53
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 2 --action permit --protocol udp --source-port 123
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 3 --action permit --protocol icmp
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 4 --action permit --protocol tcp --destination-port 58122
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 5 --action permit --protocol tcp --destination-port 80
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 6 --action permit --protocol tcp --destination-port 443
   ovhcloud ip firewall rule create NEW_IP/32 NEW_IP --sequence 19 --action deny --protocol ipv4
   # 全部 state=ok 後：
   ovhcloud ip firewall enable NEW_IP/32 NEW_IP
   ovhcloud ip reverse set NEW_IP/32 NEW_IP ks-aw-01.aware-wave.com.
   ```
   帳號在**世界區** `ca.ovhcloud.com`（整併日坑：歐洲區登入頁會回「密碼錯誤」，兩套獨立帳號庫）。GAME firewall 刻意不設。
3. `refresh-cf-edge-geo.sh` 已在 `/root/scripts/`（隨 1d 帶走），nginx geo guard 自動跟機器走。

### 1g. 🔴 repo 裡寫死現役 IP 的活性工具（換機日逐一改；`git grep -n "149.202.64.114"` 重新產清單）

2026-08-28 實查（`.md` 歷史文件不改）：
`scripts/check-backup-health.ps1`、`check-capacity-health.ps1`、`check-clickhouse-health.ps1`、`check-cloudflare-security.ps1`（探測 --resolve ×2 + 標題）、`check-deploy-drift.ps1`、`check-smoke-tests.ps1`（ks-aw-01 profile host）、`check-supabase-memory-monthly.ps1`、`lobster-trigger-deploy.ps1`、`open-supabase-ssh-tunnel.ps1`、`refresh-cf-origin-ips.ps1`（ssh 目標）、`ao-resume.ps1`（reboot 訊號標籤 ×2）、`.claude/commands/sg-deploy.md`、`lobster-factory/infra/soulful/docker-compose.yml`（註解）、`mcp/user-env.template.ps1`（註解）。
另：`AWARE_WAVE_CREDENTIALS.md`（操作者自管）、OVH 舊機防火牆/白名單清理見 §6。

---

## §2 Phase 0 — 新機硬化（下單日～D-1，零風險）

照 [`HETZNER-SERVER-MIGRATION...md`](HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md) §7 checklist 的 P2 系列執行，ks-aw-01 建置時的實戰註記：

1. Ubuntu 24.04；RAID1 確認 `cat /proc/mdstat` → `[UU]`；`nvme smart-log` 兩碟 `percentage_used <40%`；**rescue mode 實按一次**
2. SSH 改 58122：**Ubuntu 24.04 是 `ssh.socket`，改 `sshd_config` 無效**——systemd socket override 雙埠並行→驗證→撤 22；建 `ubuntu` 工作帳號
3. UFW(58122/80/443) + **DOCKER-USER chain + `docker-user-chain.service`**（4/20 挖礦事件根治；`iptables-persistent` 安裝會**靜默移除 ufw**，裝完必查 `ufw status`）
4. Docker + `/etc/hosts` registry 行 + daemon.json insecure-registries（§1d）
5. fail2ban、sysctl/THP、fstrim、unattended-upgrades

## §3 Phase 1 — 零停機預備（D-1～D0）

1. 新機產 `consolidation_pull` 金鑰 → 舊機(ks-aw-01) authorized_keys 加 `from="NEW_IP"` 受限行
2. **預拷（全部 `--numeric-ids`，整併日最痛的坑：rsync 預設按名稱對映 owner，pgsodium key 權限炸掉 supabase-db）**：
   ```bash
   RS='rsync -a --numeric-ids -e "ssh -i /root/.ssh/consolidation_pull -p 58122"'
   # §1a 全部目錄、§1d 系統層、/var/lib/docker/volumes/（具名+§1c 匿名卷）
   ```
3. §1b images `docker save|load`；各 compose 目錄 `docker compose pull` 預拉
4. nginx + letsencrypt 就位 → `nginx -t`（**`limit_req_status` http 層只能出現一次**，rate-limit-zones.conf 已註解掉重複行，帶走時勿還原）
5. §1f 邊緣層三件套；CF whitelist v4+v6 **先加**（切換前生效）
6. Kuma DB 備份：`docker exec uptime-kuma cp /app/data/kuma.db /app/data/kuma.db.bak-<date>`

## §4 Phase 2 — 分群切換（每群：停舊 → final rsync → 起新 → 本機驗 → DNS PATCH）

順序與整併日相同（依賴驅動；Supabase+n8n+Postiz **必須同窗**，共用 supabase-db）：

| 順 | 群 | 實測窗口 | 群內特記 |
|----|----|---------|---------|
| 1 | Uptime Kuma | ~3 分 | 起新後看板即接手監控 |
| 2 | MainWP | ~5 分 | wp-cron 由 root crontab 行維持 |
| 3 | Render 雙服務 | 0（無狀態，新舊並跑到 DNS 切完）| DNS-only 記錄,TTL 300 |
| 4 | Supabase+n8n+Postiz | ~6 分 | 起 supabase→healthy→n8n→postiz;**kong `KONG_NGINX_WORKER_PROCESSES=4` 已在 compose**（整併日坑:worker 數隨核心數爆 memcg）|
| 5 | Trigger.dev | ~8 分 | registry 匿名卷必須有資料（§1c）;runner 拉 image 驗證 `docker logs trigger-supervisor` 無 Failed to pull |
| 6 | SG 棧+Oracle | ~9 分 | lobster-nginx 綁 `127.0.0.1:8083`（.env `NGINX_HOST_PORT`）;host nginx `sg-stack.aware-wave.com` vhost **80 和 443 兩個 block 都要 guard**（整併日坑×2）|
| 7 | soulful | ~5 分 | 三容器停→volume final rsync→起;`X-Soulful-Cache` header 驗快取 |

每群 final rsync 加 `--delete`；DNS PATCH 完 `curl` 過 CF 驗 200 再做下一群。

## §5 Phase 3 — 驗證（全項，缺一不算完成）

1. **15 端點掃描**（期望碼）：soulful/aware-wave/app.../oracle/uptime/mainwp/n8n healthz/trigger login/remotion/video health＝200；www=301；postiz=307；supabase rest・studio=401
2. **Origin guard**：14 個 proxied hostname `--resolve host:443:NEW_IP` 直連全部 **403**（含 IPv6 直連抽測）；remotion/video 直連 200
3. **備份三管線**在新機 real-run + verify PASS + R2 objects 實列 + 變異測試（錯 prefix → 可見 FAIL exit 1）
4. **Kuma 看板 23/23 綠**（URL 全公開網域，不需改）＋ endpoint-alert heartbeat OK（journal 兩輪零失敗輸出）
5. **Telegram**：`getWebhookInfo` pending=0 無 last_error；**Trigger**：30 分鐘內 TaskRun 全 COMPLETED_SUCCESSFULLY
6. **§1g IP 清單逐檔改** → `check-{backup,capacity,clickhouse,cloudflare-security,deploy-drift}` 全部實跑 PASS
7. 機上出站：DNS/HTTPS/NTP（edge firewall 規則 0/1/2 的活體證明）；PTR 反查 = ks-aw-01.aware-wave.com

## §6 Phase 4 — 舊機退場（驗證後 48h 觀察 → 操作者明示同意）

1. OVH Manager → 舊機 service → 取消續約（月租到期即止；**確認扣款週年日避免多付一輪**）
2. CF 兩 zone 移除舊 IP 的 v4/v6 whitelist；`ks-aw-01` A 記錄與 rDNS 已在 §4/§1f 更新
3. repo `git grep <OLD_IP>` 清零活性引用；`AWARE_WAVE_CREDENTIALS.md` 提醒操作者自改
4. WORKLOG + TASKS + QUICKREF 拓樸更新

## §7 回滾

- **任一群失敗**：新機 `docker compose stop` 該群 → 舊機 `docker compose start` → DNS PATCH 回舊 IP（舊機資料停在該群停機那刻，窗內零寫入 = 零遺失）
- **邊緣層失敗**（新機被鎖）：OVH console 隨時可 `firewall disable`；CF whitelist 與 DNS 與機器無關
- **全面中止**：所有 DNS 尚未切的群不受影響；已切的群逐一切回。舊機保留到 §6 才退租 = 全程有家可回。

## §8 整併日教訓總表（2026-08-28 全部真實踩過，本 runbook 的存在理由）

| 坑 | 症狀 | 已焊進哪一節 |
|----|------|------------|
| rsync 名稱對映 owner | supabase-db `invalid secret key` 重啟循環 | §3.2 `--numeric-ids` |
| sites-enabled 是 symlink | vhost 空檔，SNI 掉 default server | §1d |
| letsencrypt 根目錄兩檔 | nginx -t 直接 fail | §1d |
| 匿名卷不在 volume ls 名單 | Trigger runner 拉不到 image，任務全掛 | §1c |
| registry 名字解析+insecure | 同上第二層 | §1d |
| CF 白名單漏 IPv6 | 主機自打 403 challenge，容器 v4 掩蓋 | §1f.1 |
| kong worker=CPU 數 | 16 核塞爆 768M memcg，OOM 連殺 | §4 群 4 |
| guard 只插第一個 server block | soulful/sg-stack 443 裸奔 | §4 群 6 |
| OVH UI hitbox | 規則存不進去且無錯誤 | §1f.2 Cloud Shell |
| OVH 帳號分區 | 「密碼錯誤」假象 | §1f.2 |
| 備份 exit 在 R2 之前 | 零異地還只報 WARNING | 已治本於腳本；§5.3 驗證 |
| limit_req_status 重複 | nginx -t fail | §3.4 |

---

_維護：每次換機後把新踩的坑補進 §8、§1 清單依機器實查回寫。_
