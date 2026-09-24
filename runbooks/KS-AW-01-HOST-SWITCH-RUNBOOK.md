# ks-aw-01 換機 Runbook + 計劃書（整併後單機時代的主機轉移唯一正本）

> **建立 2026-08-28**，由當日完成的三機整併（SG+EU+Hostinger → ks-aw-01）實戰驗證中提煉。
> 本文件是「操作者月租退出權」的執行載體：發現更便宜／更符合規格地板的機器
> （例：**KS-6 $59.80/mo 128GB ECC 2×1TB**（價格為 2026-08 決策文件基準，下單以當日頁面為準）、KS-7、Hetzner auction 合規機）時，
> 照本文件把 ks-aw-01 整機搬過去。
>
> **決策鏈**：[`2026-08-17-dedicated-host-spec-upgrade.md`](../agency-os/reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md)
> （規格地板 128GB ECC/1TB）→ [`2026-08-18-dedicated-host-purchase-timing.md`](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md)
> （立刻買＋月租退出權；其「soulful 落地後切換窗已關」條款由本文件**接棒**：窗沒有關，
> 只是換機成本從「重跑建置」變成「整機轉移」，本文件就是那個成本的定價與執行手冊）。
> **拓樸事實正本**：[`AWAREWAVE_STACK_QUICKREF.md`](../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。
> 舊時代（EU/SG 分立）遷移正本 [`HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md) 保留為歷史與備份/還原章節引用。

> **換機時只讀本文件。**本文件是主機轉移的唯一執行正本，已內嵌 auto-reboot／boot-notify 的搬遷與驗收 gate。`VPS-AUTO-REBOOT-RUNBOOK.md` 只處理已穩定上線後的日常 apt reboot；切換窗中不要在兩份文件之間拼湊流程。

> **最近一次實施（2026-08-31）**：現役 ks-aw-01 已切至 `145.239.195.47`
> （OVH KS-6，IPv6 `2001:41d0:203:a62f::1`；前任 `149.202.64.114`）。本次驗收發現並修正：
> Soulful 443 vhost 漏 `cf-only` guard、auto-reboot/endpoint-alert 機器層檔案漏部署、
> MariaDB 11.8 備份 client 名稱差異、Certbot Cloudflare DNS 外掛缺失。所有三條備份
> 管線在新機 real-run + verify + R2 後為 PASS。未來換機以本段為歷史實例，不可把前任 IP
> 當作現役目標。

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
| SG 棧(nginx/WP/api/admin/redis/觀測) | `/root/lobster-phase1/`（**exclude `backups/`**；`.env` 是機器設定 SSOT；**`nginx/default.conf` 只能整份直接 rsync 現役機的活檔，絕不可從 repo `lobster-factory/.../nginx/system-sites/*.conf` 這類 2026-06/07 舊架構快照重建**——那批檔案 `X-Forwarded-Proto` 用的是已知有 bug 的 `$scheme` 寫法，2026-08-29 wp-admin 無限重導事故根源，現役檔已修好用 `$http_x_forwarded_proto`，直接 rsync 才會帶到修復） | `lobster-phase1_{wordpress_data,wordpress_db_data,redis_data,loki_data,grafana_obs_data}` |
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

- `/etc/nginx/sites-available/`（14 檔，2026-08-29 由 11 檔新增 `docs.aware-wave.com`/`trust.aware-wave.com`/`00-default-placeholder`；**從 sites-available 拿真檔，sites-enabled 是 symlink** — 整併日坑）；拷完**必重建啟用 symlink**（覆審 F3）：`for f in /etc/nginx/sites-available/*; do ln -sf "$f" /etc/nginx/sites-enabled/; done`再 `nginx -t`＋ `conf.d/{soulful-security,soulful-cache,rate-limit-zones,cf-edge-geo}.conf`＋`snippets/cf-only.conf`＋**`snippets/coming-soon.conf`**（2026-08-29 新增，`docs`/`trust`/`00-default-placeholder` 三個 vhost 都 `include` 它，漏拷 = 新機 `nginx -t` 直接炸；repo 鏡像 `system-sites/coming-soon.inc`）。
  - **「default 檔」用詞澄清（避免與新安全網混淆）**：`sites-available/default`（Debian 內建 stock 檔，未啟用，可依現況取捨略過）≠ **`00-default-placeholder`（2026-08-29 新增，`default_server` 安全網，屬安全邊界一部分，換機必拷不得省略——省略會讓 docs/trust 之外任何未來忘記建 vhost 的子網域重新落回字母序最前的 mainwp，回到 2026-08-29 事故原狀）**
  - **`nginx -t` 的 warning 也要歸零**（2026-08-31 KS-6 post-cutover audit）：所有啟用的 IPv4 TLS vhost（含 `00-default-placeholder`）的 `listen 443` 協定選項必須一致；現況統一 `listen 443 ssl http2;`。混用 `ssl` 與 `ssl http2` 雖不會令語法測試失敗，仍會出現 `protocol options redefined`，把真實新警告埋在噪音裡。
- `/etc/letsencrypt/` 整棵：`archive/ live/ renewal/ accounts/` **加 `options-ssl-nginx.conf` `ssl-dhparams.pem`**（整併日坑：漏這兩檔 nginx -t 直接炸）；renewal conf 的 `account` 已統一單一帳號 ✓
- `/etc/hosts` 的 `127.0.0.1 registry` 行 + `/etc/docker/daemon.json` 的 `insecure-registries:["registry:5000"]`（整併日坑；改完 `kill -HUP dockerd` 免重啟）
- **root crontab 不是檔案，不能 rsync**（覆審 F4）：`ssh OLD 'sudo crontab -l' | ssh NEW 'sudo crontab -'`（11 行，需逐行目視確認）
- `/etc/cron.d/{lobster-backup,ks-stack-backup,ks-aw-01-backup}` ＋ `/etc/default/{eu-backup,**ks-aw-01-backup**,awarewave-endpoint-alert*}`（600；覆審 F2：漏 `ks-aw-01-backup` 則 soulful 管線的 EXPECT_SERVICES/R2/加密設定全沒）
- systemd `awarewave-endpoint-alert.{service,timer}` 拷入 `/etc/systemd/system/` 後**必跑**（覆審 F5：拷檔不等於註冊）：`systemctl daemon-reload && systemctl enable --now awarewave-endpoint-alert.timer`（2026-09-24 起 ExecStart = `/root/lobster-phase1/scripts/endpoint-alert.sh`，不再拷 `/usr/local/bin`）
- **WP-Cron 排程器**：`/root/lobster-phase1/scripts/wp-cron-runner.sh --install`（cron.d 每分鐘＋logrotate＋`/etc/awarewave-alert/fresh.d/` 死人開關）。DISABLE_WP_CRON 的站（soulful-wp）沒有它 = 排程全停（2026-08-28→09-24 實例）。**切換凍結期間**：舊機與新機都 `touch /var/lib/wp-cron-runner/paused.<container>`（WP-CLI 無視維護模式），解凍後刪。
- **Auto-reboot 與開機回報是同一個單機控制面，必須整組搬**：從 repo 的 `lobster-factory/infra/hetzner-phase1-core/auto-reboot/` 安裝 `ks-aw-01-auto-reboot.conf` → `/etc/apt/apt.conf.d/52awarewave-auto-reboot`、`ks-aw-01-boot-health-notify.sh` → `/usr/local/bin/ks-aw-01-boot-health-notify.sh`（0755）、`ks-aw-01-boot-notify.service` → `/etc/systemd/system/`；再 `systemctl daemon-reload && systemctl enable ks-aw-01-boot-notify.service`。此 script 讀既有 `awarewave-endpoint-alert{,.local,.telegram}`，因此前一項的 env 檔漏搬會令「reboot 後 Telegram 回報」靜默失效。**單機只用 52，不得搬舊 `53awarewave-stagger-eu.conf`。**
- **Trigger deploy 工具鏈主機層狀態**（覆審 F6，`trigger/README.md` §7a 明寫換機必重做）：`/etc/buildkit/buildkitd.toml`（registry:5000 http+insecure）+ `docker buildx create --name trigger --driver docker-container --driver-opt network=host --config /etc/buildkit/buildkitd.toml --use` + `inspect --bootstrap`（builder metadata 不在任何 volume 裡，2026-08-28 實證：ks 自己就漏了這步，當場補修）
- `/root/.ssh/`：`soulful_pull`（Hostinger 觀察期內）、`work_deploy`（GitHub deploy key）＋ `config` alias＋**`known_hosts` 的 GitHub Ed25519 key**。新機第一個 `sg-deploy.sh` 會 `git pull`；只搬 deploy key 不搬或不先驗證 GitHub host key 會安全地以 `Host key verification failed` 中止。從 GitHub 官方 SSH fingerprint 文件核對 Ed25519 指紋後再寫入，接著 `git ls-remote origin HEAD` 實測 deploy key。
- **所有 `auth_basic_user_file` 密碼檔**（2026-08-29 坑：`.htpasswd_studio` 漏拷 → Docker 幫你自動建成同名**目錄** → nginx 500）：換機前在來源機跑 `sudo grep -rh auth_basic_user_file /etc/nginx/sites-available/` 產出完整路徑清單，逐一 `stat <path>` 確認型別是 `regular file`；拷到新機後**同樣 `stat` 驗一次**，不能只憑 `ls` 有東西就放行（空目錄在 `ls` 底下看起來也像「有東西」）
- **Netdata Cloud claim**（2026-08-29 坑：Ubuntu `apt install netdata` 編譯時 `--disable-cloud`，`netdata-claim.sh` 直接拒絕 exit=3，kickstart 也拒絕覆蓋系統套件管理的安裝）。換機後要接回 Netdata Cloud 儀表板，正確順序：
  ```
  sudo cp -a /etc/netdata /root/netdata-etc-bak-$(date +%Y%m%d)
  sudo apt-get remove --purge -y netdata netdata-core netdata-web netdata-plugins-bash
  wget -qO /tmp/netdata-kickstart.sh https://get.netdata.cloud/kickstart.sh
  sudo sh /tmp/netdata-kickstart.sh --stable-channel --non-interactive \
    --claim-token <TOKEN> --claim-rooms <ROOM_ID> --claim-url https://app.netdata.cloud
  ```
  官方版預設監聽 `0.0.0.0:19999`，裝完務必在 `/etc/netdata/netdata.conf` 的 `[web]` 段加 `bind to = 127.0.0.1` 再 `systemctl restart netdata`，否則對外暴露監控面板。`sudo netdatacli aclk-state` 應回 `Claimed: Yes`。

  **已是健康官方 agent 時的 re-claim 例外**：不要為了更新 Cloud 身分重跑 kickstart（尤其不要無故切 nightly）。以新的一次性 claim token + room 建立 `/etc/netdata/claim.conf`（`root:netdata`、`0640`）、重新載入 agent 後，必須同時驗 `Claimed: Yes` 和 `Online: Yes`；保留 `[web] bind to = 127.0.0.1`。這是 KS-6 於 2026-09-01 的實戰補充。

- **Node.js（host 層，非容器內）**：`sg-deploy.sh` 的 tsc typecheck/npm test gate 直接在**新機系統層**跑 `npm --prefix .../next-admin run typecheck`，不是在 container 裡——**docker save/load 帶的是既有 image，不含這個 host 依賴**，換機後第一次跑 `sg-deploy.sh next-admin` 才會撞到（2026-08-29 整併後首次驗證：`ks-aw-01` 從沒裝過 Node，直接 `npm: command not found` 擋下整個部署）。換機時務必主動裝，不要等下次部署才發現：
  ```bash
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt install nodejs -y
  node -v   # 應為 v20.x，對齊 next-admin Dockerfile 的 node:20-alpine
  ```

### 1e. DNS（Cloudflare，PATCH `content` → NEW_IP；record id 現查 `GET /zones/<zone>/dns_records`）

- zone `f21b1919632fee2221647908a94fdcac`（aware-wave.com）：**2026-08-29 CF API 直查實測共 16 筆 A**（apex/api/app/oracle/mainwp/n8n/postiz/studio/supabase/trigger/uptime/**portal/docs/trust**（三筆 2026-08-29 新增）= proxied🟠；`remotion-svc`/`video-svc` = **DNS-only⚪ 勿開 proxy**）＋ `ks-aw-01` A（DNS-only，rDNS 配對用 → 同步改，第 17 筆）＋ www CNAME 不動。**此筆數會隨新子網域上線持續變動，換機當天務必重新 `GET /zones/<zone>/dns_records?type=A` 現查，不要沿用本文任何寫死數字**
- zone `bb1358fe8d3e1d73c822bdb31d3cd823`（soulfulexpression.org）：apex A（record `5287ae0edbce87ec8a9fa6152e05e220`，proxied🟠）
- `_dmarc.aware-wave.com` TXT（`v=DMARC1; p=none; ...`，2026-08-29 補；新網域上線務必比照補一筆，否則可被偽造寄信且不會主動跳警告）

**新子網域/新服務上線 checklist**（2026-08-29 補，首筆對象 `cognitive.aware-wave.com`——操作者建造中的 Cognitive Engineering 工具，**DNS 記錄延後到 MVP 可 serve 才建**，決策 SSOT：`agency-os/docs/AI_LEGO_Cognitive_Engineering_OS/AI_LEGO_OS_Program_Plan_v1.md:142`，理由：避免 dangling DNS / subdomain takeover / Kuma 假紅）：

| 項目 | 動作 |
|------|------|
| CF DNS A 記錄 | 加 `<sub>.aware-wave.com` → 新機 IP，預設 proxied🟠（除非有 CF 100s timeout 顧慮，同 remotion-svc/video-svc 案例才設 DNS-only） |
| nginx vhost | 新建 `sites-available/<sub>.aware-wave.com`，**務必 `include /etc/nginx/snippets/cf-only.conf`**（2026-08-28 坑：漏插 guard = 裸奔） |
| TLS | certbot 簽新網域證書，走同一帳號（`renewal/` 已統一單一 account，勿另開新帳號） |
| DMARC | 若此服務會寄信（通知/驗證信等），確認上方 `_dmarc.aware-wave.com` 已存在 |
| §1g 硬編 IP 清單 | 若程式碼寫死 IP 或網域，跑 `git grep` 重新產清單納入換機改動範圍 |
| 本節 A 記錄計數 | 每次新子網域上線後，跑 §1e 開頭那行 `GET .../dns_records?type=A` 現查真實筆數更新本節（**不要手動加減**——2026-08-29 曾因同日疊加 portal/docs/trust 三筆導致「13→14」的預先寫死數字當天就過期，改成永遠現查） |
| **驗證用內容比對，不只看狀態碼** | `curl` 後檢查 `<title>`/內文，不能只看 HTTP code——2026-08-29 兩次真事故（api/oracle 錯發 WordPress、docs/trust 錯發 MainWP）都回 200，只看狀態碼完全看不出來 |
| **確認沒有落進隱性 default** | host nginx 若無任何 `default_server`，未掛號的子網域會落進 `sites-enabled/` 字母序最前的檔案（2026-08-29 事故：`mainwp.aware-wave.com` 排最前，docs/trust 誤入其登入頁）。**現況已補安全網**：`system-sites/default-placeholder-aware-wave.conf`（`00-default-placeholder`，`default_server` on both :80/:443，回中性佔位頁）——新子網域即使忘記建 vhost 也不會誤入內部工具，但仍應主動建專屬 vhost，安全網只是最後防線不是正式做法 |

### 1f. Cloudflare / OVH 邊緣層（新機必補，整併日兩個坑都在這）

1. **兩個 zone 各加 IP Access whitelist**：NEW_IP（target=`ip`）**和 NEW_IP 的 IPv6 /64（target=`ip_range`，不是 `ip6`；v6 位址新機上 `ip -6 addr show scope global` 取）** —— 整併日坑：只加 v4，主機自打自家網域走 v6 被 CF challenge 403，容器純 v4 掩蓋了問題
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
   # ℹ️ 順序硬約束（自審 M1）：先把 CF 的 `ks-aw-01` A 記錄 PATCH 成 NEW_IP（rDNS 驗證正向配對，沒改先會 fail）
   ovhcloud ip reverse set NEW_IP/32 NEW_IP ks-aw-01.aware-wave.com.
   ```
   帳號在**世界區** `ca.ovhcloud.com`（整併日坑：歐洲區登入頁會回「密碼錯誤」，兩套獨立帳號庫）。GAME firewall 刻意不設。
3. `refresh-cf-edge-geo.sh` 已在 `/root/scripts/`（隨 1d 帶走），nginx geo guard 自動跟機器走。

### 1g. 🔴 repo 裡寫死現役 IP 的活性工具（換機日逐一改；對「當時舊 IP」跑 `git grep -n` 重新產清單）

2026-08-31 實查：前任 `149.202.64.114` 的下列活性引用已改為現役
`145.239.195.47`（`.md` 歷史文件不改）：
`scripts/check-backup-health.ps1`、`check-capacity-health.ps1`、`check-clickhouse-health.ps1`、`check-cloudflare-security.ps1`（探測 --resolve ×2 + 標題）、`check-deploy-drift.ps1`、`check-smoke-tests.ps1`（ks-aw-01 profile host）、`check-supabase-memory-monthly.ps1`、`lobster-trigger-deploy.ps1`、`open-supabase-ssh-tunnel.ps1`、`refresh-cf-origin-ips.ps1`（ssh 目標）、`ao-resume.ps1`（reboot 訊號標籤 ×2）、`.claude/commands/sg-deploy.md`、`lobster-factory/infra/soulful/docker-compose.yml`（註解）、`mcp/user-env.template.ps1`（註解）。
另：`AWARE_WAVE_CREDENTIALS.md`（操作者自管）、OVH 舊機防火牆/白名單清理見 §6。

---

## §2 Phase 0 — 新機硬化（下單日～D-1，零風險）

照 [`HETZNER-SERVER-MIGRATION...md`](HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md) §7 checklist 的 P2 系列執行，ks-aw-01 建置時的實戰註記：

1. Ubuntu 24.04；RAID1 確認 `cat /proc/mdstat` → `[UU]`；`nvme smart-log` 兩碟 `percentage_used <40%`；**rescue mode 實按一次**
2. SSH 改 58122：**Ubuntu 24.04 是 `ssh.socket`，改 `sshd_config` 無效**——systemd socket override 雙埠並行→驗證→撤 22；建 `ubuntu` 工作帳號
3. UFW(58122/80/443) + **DOCKER-USER chain + `docker-user-chain.service`**（4/20 挖礦事件根治；`iptables-persistent` 安裝會**靜默移除 ufw**，裝完必查 `ufw status`）
4. Docker + `/etc/hosts` registry 行 + daemon.json insecure-registries（§1d）；**預建 external 網路**（自審 M20，漏了則 n8n/render/SG compose 直接起不來）：`docker network create lobster-net`（`supabase_default` 由 supabase compose 自建，但需先於 n8n/postiz 起）
5. fail2ban、sysctl/THP、fstrim、unattended-upgrades
6. **netdata 代理重裝**（自審 M5，systemd 非 docker，不會隨 volume 走）：`apt-get install -y netdata`（預設僅綁 127.0.0.1:19999，維持）

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

1. **16 端點掃描**（期望碼）：soulful/aware-wave/app.../oracle/uptime/mainwp/n8n healthz/trigger login/remotion-svc/**video-svc** health＝200；www=301；postiz=307；supabase rest・studio=401。**不要探測 `video.aware-wave.com`**：它沒有 DNS record，會正確落入 default origin guard 的 403。
   - **`sg-deploy.sh` smoke 探針補充驗收**（2026-08-29 補，§8 表格同款教訓）：探針本身不寫死 IP、隨 git pull 自動帶到新機，理論上不用重做——但換機後**建議手動跑一次**確認前提沒被打破：`curl -k --resolve aware-wave.com:443:NEW_IP https://aware-wave.com/` 應 200（`remote_ip` 應等於 `NEW_IP`，證實走本機不是繞出去）；`curl -H "Host: api.aware-wave.com" http://NEW_IP/health` 應 200。兩個都過才代表下一次 `sg-deploy.sh next-admin` 不會被這兩個探針的假陽性打成 auto-rollback
   - **`api.aware-wave.com` 內容比對必做，不能只看狀態碼**（2026-08-29 事故：此網域曾從建立起就未接線，錯發到 WordPress 卻同樣回 200，狀態碼騙不出來）：`curl https://api.aware-wave.com/` 回應須含 `"service":"node-api"` 字樣；`curl https://oracle.aware-wave.com/ | grep -i "<title"` 不可出現 `Aware Wave`（那是 WordPress 的 title，代表又錯發了）
   - **wp-admin 無限重導回歸測試**（2026-08-29 真根因：`lobster-phase1/nginx/default.conf` 的 `X-Forwarded-Proto` 若被改回 `$scheme` 或該檔從 `nginx/system-sites/*.conf` 這類舊架構快照重建，此 bug 會複發）：`for i in 1 2 3; do curl -sk -o /dev/null -w "%{http_code} %{redirect_url}\n" https://aware-wave.com/wp-admin/; done` 三次結果必須是 `302` 導向 `wp-login.php?redirect_to=...`，**不可以是導回 `/wp-admin/` 自己**
2. **Origin guard**：所有 proxied hostname `--resolve host:443:NEW_IP` 直連全部 **403**（含 IPv6 直連抽測）；`remotion-svc`／`video-svc` 的 `/health` 直連 200。對每個 SSL vhost 同時檢查 :80、:443 block 都有 guard；只有 :80 有不算完成。
3. **備份三管線**在新機 real-run + verify PASS + R2 objects 實列 + 變異測試（錯 prefix → 可見 FAIL exit 1）
4. **Kuma 看板 23/23 綠**（URL 全公開網域，不需改）＋ endpoint-alert heartbeat OK（journal 兩輪零失敗輸出）
5. **Telegram**：`getWebhookInfo` pending=0 無 last_error；**Trigger**：30 分鐘內 TaskRun 全 COMPLETED_SUCCESSFULLY；**MainWP**：對每個子站強制同步並確認 sync_errors 清空。優先用 `wp eval`；若官方 WordPress image 未附 WP-CLI，載入 `wp-load.php` 後以 `MainWP_DB::get_website_by_id()` 取得**物件**（不是 `get_connected_websites()` 的 array），再傳入 `MainWP_Sync::sync_site()`。切換窗內的失敗同步會留下 **stale 斷線旗標**，不主動重同步要等隔日 cron 才自癒（2026-08-28 實例：aware-wave.com 紅叉 9 小時，實際一次手動同步即緑）
6. **§1g IP 清單逐檔改** → `check-{backup,capacity,clickhouse,cloudflare-security,deploy-drift}` 全部實跑 PASS
7. 機上出站：DNS/HTTPS/NTP（edge firewall 規則 0/1/2 的活體證明）；PTR 反查 = ks-aw-01.aware-wave.com
8. **Auto-reboot 控制面**（不另讀其他 runbook）：`apt-config dump | grep -E '^Unattended-Upgrade::Automatic-Reboot'` 必須有三個預期值（`true`／`20:00`／`true`）；確認 boot script 可執行、`ks-aw-01-boot-notify.service` 是 `enabled`、`53awarewave-stagger-eu.conf` 不存在，並以 `scripts/check-vps-auto-reboot-health.ps1` 對**新 IP**實跑到 healthy。切換窗內不以真正 reboot 當測試；服務穩定後才依 `/ks-aw-01-reboot` 的 High-risk 流程取得明示批准並驗證一次開機 Telegram 回報。最後用 `git grep` 掃 `scripts/`、`.claude/commands/` 的 `OLD_IP`／舊機名，逐一更新所有仍會連線或生成 reboot 指示的活性入口；歷史文件中的前任 IP 不需要清零。

## §6 Phase 4 — 舊機退場（驗證後 48h 觀察 → 操作者明示同意）

> **2026-09-01 已完成的歷史實例**：OVH Manager 顯示前任 `149.202.64.114`（`ns3006986.ip-149-202-64.eu`）自 2026-08-31 起為 **Terminated**；它不可作為回滾或下次操作目標。此段是本次證據，不改變未來換機仍須完成下列四步的程序。

1. OVH Manager → 舊機 service → 取消續約（月租到期即止；**確認扣款週年日避免多付一輪**）
2. CF 兩 zone 移除舊 IP 的 v4/v6 whitelist；`ks-aw-01` A 記錄與 rDNS 已在 §4/§1f 更新
3. repo `git grep <OLD_IP>` 清零活性引用；`AWARE_WAVE_CREDENTIALS.md` 提醒操作者自改
4. WORKLOG + TASKS + QUICKREF 拓樸更新

## §7 回滾

- **兩層回滾（覆審 F1：已開放寫入後直接 DNS 回切 = 丟寫入）**：
  - **(a) 窗內失敗**（新機驗證沒過、DNS 尚未切或剛切即發現）：新機 stop → 舊機 start → DNS 回——舊機資料停在停機那刻，零遺失
  - **(b) 已上線接寫後才發現問題**：不可直接 DNS 回切！必須反向重跑同一群的切換程序：停新機該群 → **反向 final rsync（新→舊，--numeric-ids --delete）** → 舊機 start → DNS 回。新機上接受過的寫入藉反向同步帶回，零遺失
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
| buildx builder metadata 不在 volume | 換機後首次 trigger deploy 推 registry 失敗 | §1d（2026-08-28 覆審發現 ks 現役就漏，已補） |
| external docker network 不自建 | n8n/render/SG compose 起不來 | §2.4 |
| 已接寫後 DNS 直接回切 | 丟失新機已接受的寫入 | §7(b) 反向同步 |
| Ubuntu 發行版 netdata 編譯 `--disable-cloud` | `netdata-claim.sh` 直接拒絕(exit=3),kickstart 也拒絕覆蓋系統套件管理的安裝 | §1d（2026-08-29 補：換機須 purge 發行版套件→官方 stable kickstart 重裝+claim→`[web] bind to = 127.0.0.1` 綁回本地） |
| Node.js 從沒裝在新機 | `sg-deploy.sh` tsc/npm test gate 跑在 host 層不是 container 內,docker save/load 帶不到這個依賴,首次 `sg-deploy.sh next-admin` 直接 `npm: command not found` | §1d（2026-08-29 補，portal.aware-wave.com 首次部署發現）|
| sg-deploy.sh smoke 探針假設舊拓樸 | `_smoke_check()` 的 wordpress/node-api 探針寫死「裸 Host + `/api/health`」路徑,單租戶 SG 時代成立,整併成多 vhost 後這兩個探針必 404,**每次 next-admin 部署都被無關端點的假陽性打成 auto-rollback**（next-admin 自己健康也一樣回滾）| 已治本於 `sg-deploy.sh`（commit `d9206dee`,改用 `--resolve host:443:127.0.0.1` 本機解析 + 正確 `/health` 路徑,不寫死 IP,新機沿用同一套 nginx 架構會自動生效）；**換機後仍建議跑一次 §5.1 補充驗收**確認沒有前提被打破（例如又新增/移除了 vhost,或 nginx 監聽的 port 改了） |
| 新網域上線未補 DMARC | 該網域可被偽造寄信，且不會主動跳警告直到被人拿去釣魚 | §1e（2026-08-29 補：新增子網域/新 zone 上線 checklist 需含 `_dmarc` TXT） |
| `.htpasswd` 類檔案漏拷，容器搶先 bind-mount 不存在的 host 路徑 | Docker 自動把該路徑幫你建成**目錄**，host nginx `auth_basic_user_file` 讀到目錄 → `pread() failed (21: Is a directory)` → 500；修完後容器內部仍記著舊掛點型別，`docker restart` 會直接 mount 失敗、容器 Exited，須 `docker compose up -d --force-recreate <service>`（compose service 名可能不等於 container_name，先查 `container_name:` 對應） | §1d（2026-08-29 補：所有 `auth_basic_user_file` 引用的 `.htpasswd*` 路徑，換機前先在來源機 `find / -iname "*.htpasswd*"` 產清單，逐一確認搬過去的是檔案不是目錄；`stat` 型別對照，不能只看 `ls` 有沒有東西） |
| `api.aware-wave.com`/`oracle.aware-wave.com` 從未接線（既有缺陷，非搬家造成，2026-08-29 才被發現） | 兩個網域無匹配 server block，落到 WordPress 預設區塊，**狀態碼一樣回 200**，光看端點掃描碼看不出來，內容其實整個發錯 | §5 第 1 項（2026-08-29 補：改用內容比對，不只看狀態碼） |
| `X-Forwarded-Proto` 在 lobster-nginx 兩跳架構下用 `$scheme` 覆寫上一跳的值 | `$scheme` 是這層 nginx 自己監聽器的 scheme（永遠 http），把 host nginx 已正確設的 https 蓋掉，WordPress `is_ssl()` 永遠 false，**wp-admin 無限重導自己** | §1a（現役檔已修用 `$http_x_forwarded_proto`，rsync 帶走即可）+ §5 第 1 項回歸測試（2026-08-29 補：連 3 次 curl 確認不是導回自己） |
| host nginx（`sg-stack.aware-wave.com`）443 沒有任何 `default_server` | 未掛號的子網域落進 `sites-enabled/` **字母序最前**的檔案而非報錯——2026-08-29 `docs`/`trust.aware-wave.com` DNS 建好後誤入 `mainwp.aware-wave.com` 登入頁（同一種「隱性 default 靜默錯發」bug class，這次在 host 層而非 lobster-nginx docker 層）| **已治本**：新增 `00-default-placeholder`（`default_server` on :80/:443，回中性佔位頁，`include cf-only.conf` 一致防護），關掉「任何未來忘記建 vhost 的子網域」整類洞，不只補 docs/trust 兩個名字。repo 鏡像：`system-sites/default-placeholder-aware-wave.conf` + `docs-aware-wave.conf` + `trust-aware-wave.conf` + `coming-soon.inc`。§1e checklist 已補對應驗收項 |
| certbot 帳號目錄搬機沒清乾淨 | 換機時所有 renewal `.conf` 的 `account =` 已經統一指向新帳號（§1d 已記「已統一單一帳號 ✓」），但**舊帳號的 ACME 註冊目錄本身**（`/etc/letsencrypt/accounts/.../<舊帳號ID>/`）沒人手動刪，留在磁碟上——`certbot certificates` 看不出來（只列有效憑證），要進 `accounts/.../directory/` 才看得到兩個帳號目錄。不影響現有憑證續期，但下次手動 `certbot certonly` 新網域時，多帳號會讓「用哪個帳號」變模糊 | 2026-08-30 補：換機收尾清單新增一步——`sudo ls /etc/letsencrypt/accounts/acme-v02.api.letsencrypt.org/directory/` 應該只有一個目錄；`for f in /etc/letsencrypt/renewal/*.conf; do grep account "$f"; done` 全部 grep 出的帳號 ID 必須跟前面那唯一目錄一致；多出來的舊目錄 `cp -r` 備份到 `/root/letsencrypt-orphan-account-backup-<日期>/` 後 `rm -rf` 清掉，清完跑 `certbot renew --dry-run` 全過再收工（AWARE_WAVE_CREDENTIALS.md §32 記錄本次實例） |
| TLS vhost 的 `listen 443` 協定選項不一致 | `nginx -t` 仍可成功但連續輸出 `protocol options redefined`；警告噪音會遮住真正的設定漂移 | 2026-08-31 KS-6 post-cutover audit：所有啟用 IPv4 TLS vhost 統一為 `listen 443 ssl http2;`，`nginx -t` 零 warning 後才 reload。§1d 已補明確驗收 |
| 換機後 `/sg-reboot`／`/eu-reboot` 兩支手動 reboot 指令沒有合併 | 兩台機器變同一台後，兩支指令的 pre/post-flight checklist 分別只覆蓋各自舊拓樸的 container/endpoint 清單，且 SSH `Connection:` 各自寫死已刪除的舊 IP——`scripts/ao-resume.ps1` 的 reboot-required 告警仍照舊邏輯建議 `/sg-reboot` 或 `/eu-reboot`，會指示 Claude 執行一個連線必失敗的指令（`/codex-review` 2026-08-30 抓到） | 2026-08-30 治本：新增 `.claude/commands/ks-aw-01-reboot.md`（合併兩份 checklist 為聯集 + 補上 Postiz/Soulful，Rollback 段改指 OVH KVM 而非 Hetzner Console），`sg-reboot.md`/`eu-reboot.md` 先改為指向新指令的失效說明，2026-09-20 直接删除（墓碑檔仍每轮進指令清單），`ao-resume.ps1:1119-1126` 的 slug 邏輯改成常數 `ks-aw-01-reboot`。**換機時的通用教訓**：任何「每台機一份」的手動 runbook/slash command，在多機併一機時都要主動找出來合併，不會自動跟著拓樸文件更新 |
| 只搬 apt conf、沒搬 boot-notify／health checker／reboot 指令的連線目標 | OS 會在 04:00 重開，但新單機可能沒有 Telegram 開機回報，或人工 escalation 仍連到前任 IP；「自動 reboot 已啟用」變成沒有可觀測性的假象 | §1d 的三件套移轉 + §5.8 的 apt／service／新 IP health-check／活性入口掃描，全部通過才可視為換機完成 |

---

_維護：每次換機後把新踩的坑補進 §8、§1 清單依機器實查回寫。_
