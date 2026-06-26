# EU 自架 Stack — 備份 / RAID / 災難還原 Runbook（上 Dedicated 主機的安全前提）

> **這份文件是什麼**：EU VPS（`204.168.175.41`，跑 Supabase + Trigger + n8n + Postiz + MainWP + Uptime Kuma）
> 若要從 Hetzner **Cloud** 搬到便宜很多的 **Dedicated auction（Serverbörse）** 二手實體機，會失去 Cloud 的「硬體壞自動遷移」。
> 本 runbook = **讓 dedicated 變安全的前提層**：要備份什麼、備到哪、RAID 怎麼設、硬體壞了怎麼還原、Cloud→Dedicated 怎麼搬。
>
> **何時讀**：① 評估要不要上 dedicated 時（看 §0 決策 + §7 checklist）② 真的要搬時（照 §5）③ 硬體故障還原時（直接跳 §4）。
>
> **狀態**：框架草稿（2026-06-26 建）。確切指令在「真的要做」時於各節 `TODO:` 處補齊並實測；現階段供決策評估用。
> **相關**：拓樸正本 [`AWAREWAVE_STACK_QUICKREF.md`](../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)｜**SG/Phase1 備份正本** [`hetzner-phase1-core/LONG_TERM_OPS.md`](../lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md)（本檔負責 EU stack，兩台互為異地）｜[`VPS-AUTO-REBOOT-RUNBOOK.md`](VPS-AUTO-REBOOT-RUNBOOK.md)、[`HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md`](HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md)、`agency-os/AGENTS.md §AwareWave Stack`。

---

## §0 決策背景：為什麼需要這一層

| | Hetzner Cloud（現況） | Hetzner Dedicated auction |
|---|---|---|
| 硬體壞 | 自動遷移到健康硬體、幾乎無感 | **你的機器躺平，等技師換料（幾小時），無自動 failover** |
| 磁碟 | 單碟即可（底層有冗餘） | **必須自己做 RAID 1**，否則一碟壞全毀 |
| Snapshot | 一鍵 | **無**，要自己搭備份 |
| RAM 單價 | 漲價後貴 | **便宜 4–8 倍** |

**結論**：dedicated 用錢換不到的「自動容錯」，要用**備份 + RAID + 演練過的還原**補回來。這三件沒做好之前，**不要把客戶生產資料搬上 dedicated**。

---

## §1 要備份什麼（EU 實際盤點，2026-06-26）

> 原則：**資料庫用邏輯 dump（pg_dump / mysqldump）**，不是直接複製 data 目錄（live copy 會不一致）。檔案類用 volume / 目錄快照。

### 🔴 CRITICAL — 丟了無法重建（客戶資料 / 密鑰）
| 項目 | 位置 | 備份方式 |
|------|------|---------|
| Supabase Postgres（客戶/業務主資料） | container `supabase-db`（data 在 `/root/supabase/volumes/`） | `pg_dumpall` 邏輯 dump |
| Trigger Postgres（run 紀錄/排程/狀態） | container `trigger-postgres`，vol `trigger_trigger_pg_data` | `pg_dumpall` |
| 全部 `.env`（密鑰 SSOT） | `/root/{supabase,trigger,mainwp,postiz}/.env` | 加密複製（含在 §2 備份集）|
| MainWP DB（child site 連線/token） | container `mainwp-db`，vol `mainwp_mainwp_db` | `mysqldump` |
| n8n 資料（workflow + 憑證） | vol `n8n_n8n_data`（含 SQLite/設定）| volume 快照 + n8n export |

### 🟡 IMPORTANT — 丟了會痛但可重建
| 項目 | 位置 | 備份方式 |
|------|------|---------|
| Supabase Storage（上傳檔） | vol `supabase_storage-data` | volume 快照 |
| Trigger MinIO（packets/物件） | vol `trigger_trigger_minio_data` | volume 快照 |
| Trigger ClickHouse（run analytics） | vol `trigger_trigger_clickhouse_data` | `clickhouse-backup` 或可接受重建 |
| Postiz（排程貼文/上傳） | vol `postiz_postiz_uploads` + container `postiz`（DB 在 Supabase？待確認 `TODO`）| volume + DB dump |
| MainWP files | vol `mainwp_mainwp_files` | volume 快照 |
| Uptime Kuma（監控設定/歷史） | vol `uptime-kuma` | volume 快照 |
| compose / 設定 | `/root/{各 stack}/docker-compose.yml` + 子目錄 | 目錄複製（多數已在 `Work` repo） |

### 🟢 可丟棄（cache，不必備）
`trigger_trigger_redis_data`、`postiz-redis`、`supabase_deno-cache`、`trigger_trigger_shared`（runtime 暫存）。

> **既有備份現況（2026-06-26 實測 `/root/scripts/backup-eu-stack.sh`）— 不重造，只補漏**：
>
> **✅ 已每日備份（02:30 UTC，cron `/etc/cron.d/eu-backup`）**：
> - Supabase PG（`pg_dumpall -U supabase_admin` → `supabase-all.sql.gz`）
> - Trigger PG（`pg_dump -U trigger trigger` → `trigger.sql.gz`）
> - Uptime Kuma volume（`uptime-kuma.tgz`）
> - 異地 L1：rsync → SG VPS（key `/root/.ssh/backup_to_sg`）｜異地 L2：**Cloudflare R2**（bucket `lobster-backup`，prefix `eu`，`upload-to-r2.sh`）→ **3-2-1 已成立**（本機 + SG + R2）
> - integrity 驗證：`verify-backup-eu.sh`（gzip/tar -t + 檔案存在 + SG 異地存在）
>
> **🔴 確認的漏洞（backup-eu-stack.sh 沒涵蓋，機器死即永久遺失）**：
> | 漏項 | dump 指令（已驗帳號）| 優先 |
> |------|------|------|
> | **MainWP DB** | `docker exec mainwp-db mysqldump -u root -p"$MYSQL_ROOT_PASSWORD" mainwp \| gzip` （user=mainwp/db=mainwp，root_set=yes）| 🔴 |
> | **`.env` 密鑰 ×4** | `tar czf - /root/{supabase,trigger,mainwp,postiz}/.env \| openssl enc -aes-256-cbc -pbkdf2 -out env.tar.gz.enc`（**加密後**才離機）| 🔴 |
> | **n8n** | `docker run --rm -v n8n_n8n_data:/d:ro -v $OUT:/b alpine tar czf /b/n8n.tgz -C /d .` | 🔴 |
> | Postiz uploads | 同上 vol `postiz_postiz_uploads` | 🟡 |
> | Supabase Storage | 同上 vol `supabase_storage-data` | 🟡 |
> | Trigger MinIO | 同上 vol `trigger_trigger_minio_data` | 🟡 |
> | MainWP files | 同上 vol `mainwp_mainwp_files` | 🟡 |
>
> **🔴 兩個結構性問題**：① `verify-backup-eu.sh` **只驗 integrity、從沒真的還原過**（= 等於沒演練，見 §6）② 異地 L1 指向 **SG**，**SG 退役後這條斷**，只剩 R2 單一異地 → 退 SG 前需補第二異地（R2 第二 region 或 Hetzner Storage Box）。
>
> **補漏動作（Medium，改 prod 備份腳本，需另行 propose）**：把上表 🔴🟡 加進 `backup-eu-stack.sh`（同樣 integrity 驗證 + 納入 R2/異地）。`.env` 加密金鑰存本機 vault，**不可**跟備份放一起。

---

## §2 備份策略（3-2-1）— 現況已達標，重點在「補漏 + SG 退役後的異地接替」

> **3-2-1 rule（業界備份基準）**：**3** 份資料、**2** 種媒介、**1** 份異地離線。

**現有實作（`backup-eu-stack.sh`，已符合 3-2-1）**：

| 層 | 現況 | 頻率 | 保留 | SG 退役影響 |
|----|------|------|------|------------|
| 本機 | `/root/backups/<stamp>/` | 每日 02:30 | 7 天 | 無 |
| 異地 L1 | rsync → **SG VPS** | 每日 | — | **❌ 斷**（SG 退役）|
| 異地 L2 | **Cloudflare R2**（bucket `lobster-backup`/prefix `eu`）| 每日 | — | ✅ 不受影響 |

**所以策略不是「重建」，是兩件補強**：
1. **補漏覆蓋**（§1 表的 🔴🟡）— 加進 `backup-eu-stack.sh`，含 integrity 驗證 + 一起進 R2。
2. **SG 退役前補第二異地**取代 L1：選一 →
   - (a) **R2 第二 bucket/region**（最省力，已有 R2 帳號）
   - (b) **Hetzner Storage Box**（`BX` 系列，SFTP/borg；新機房 = 真正獨立故障域）
   - (c) 新的大 dedicated 本身當第二落地（遷移後）

- **`.env` 密鑰**：`openssl enc -aes-256-cbc -pbkdf2` 加密後才進備份；**金鑰存本機 vault（`secrets-vault.ps1`），絕不跟備份同地**。
- **失敗告警**：`verify-backup-eu.sh` 已有；接現有 Telegram alert 管線（見 `runbooks/ADD-PERIODIC-HEALTH-CHECK.md`；零記憶負擔 = 失敗自己會叫）。**`TODO:` 確認 verify 失敗有真的觸發 Telegram。**

---

## §3 RAID 設定（dedicated 開機時，**搬之前先做**）

> Cloud 現況是**單碟無 RAID**（`sda` 152.6G 一顆）。dedicated 必須改用雙碟 **RAID 1（mirror，一碟壞另一碟頂著）**。

1. 挑 auction listing：**雙碟 + NVMe/SSD**（避免 SATA HDD，Postgres/ClickHouse I/O 會慘）。
2. Hetzner **rescue 系統** → `installimage` 安裝 OS 時選 **RAID 1**（`mdadm`，軟體 RAID）。
3. 開機後 `cat /proc/mdstat` 確認 `[UU]`（兩碟都在）。
4. **二手碟先驗健康**：`smartctl -a /dev/nvme0` / `/dev/sda`，看 `Power_On_Hours`、`Reallocated_Sector`、`Wear_Leveling`。數據差的 listing 直接換一台。
5. 設 `mdadm` 故障 email/告警 → 接 Telegram。
- `TODO:` RAID 重建（換碟後 resync）步驟細節在實機時補。

---

## §4 災難還原 Runbook（硬體壞 → 復原）

> 觸發：dedicated 整機掛 / 一碟壞 / 資料毀損。**目標 RTO（復原時間目標）、RPO（可接受資料遺失窗口）先定**：建議 RPO ≤ 24h（每日備份）、RTO ≤ 數小時。

**單碟壞（RAID 1 救援）**：機器還活著 → Hetzner 換碟 → `mdadm --add` 重建 mirror → 不需動資料。（這就是 RAID 的價值。）

**整機壞 / 需重建**：
1. Hetzner 開新 dedicated（或修好原機）→ §3 裝 OS + RAID。
2. `git clone` `Work` repo → 拿回所有 compose / scripts。
3. 從 Storage Box 拉最新備份集（restic restore）。
4. 還原密鑰：解密 `.env` 放回 `/root/{stack}/`。
5. 還原 DB：`psql < supabase_dump.sql`、`trigger` 同理、`mysql < mainwp_dump.sql`。
6. 還原 volumes：storage / minio / n8n / uptime-kuma。
7. `docker compose up -d`（各 stack）→ 等 healthy。
8. **驗證**：Supabase 登入 + 客戶資料在、Trigger 排程在（`TaskSchedule`）、MainWP 連得到 child、app.aware-wave 能佈建。
9. DNS：若換 IP → 更新 Cloudflare A record（`TODO:` 列出所有指向 EU 的 record）。
- `TODO:` 每步補確切指令 + 預期輸出（實機演練時定稿）。

---

## §5 Cloud → Dedicated 遷移 Runbook（一次性，有停機）

> **這是個專案不是點一下。** 風險 High（客戶資料搬移）。排低流量時段 + 全程可回滾（原 Cloud 機保留到驗證完才退）。

1. **前置**：§2 備份全綠 + §3 dedicated（RAID + SMART 過）就緒 + §4 還原已**演練過一次**。
2. 凍結寫入（短維護窗）：停對外入口，避免遷移中產生新資料。
3. 取最終一致 dump（所有 🔴🟡）。
4. 在 dedicated 還原（照 §4 step 2–7）。
5. 切 DNS → dedicated IP，TTL 先調短。
6. **平行驗證**：兩機都在，逐項對比（資料筆數、登入、佈建、監控）。
7. 觀察 24–48h 無誤 → 退掉 Cloud 機。
- **回滾**：任何驗證失敗 → DNS 切回 Cloud（原機未退），零資料遺失。

---

## §6 還原演練（沒演練過的備份 = 沒有備份）— **確切指令**

> 現有 `verify-backup-eu.sh` 只驗 gzip/tar 完整性 = **「檔案沒爛」≠「還原得回來」**。真演練必須把 dump **灌進臨時 DB** 確認資料活著。
> **頻率**：每季一次（+ 每次補漏覆蓋後一次）。**目標**：RTO ≤ 數小時、RPO ≤ 24h。**全程在臨時容器，不碰 prod。**
>
> **✅ 首次演練 2026-06-26（演練 A Supabase）通過**：把 `20260625-023001/supabase-all.sql.gz` 灌進拋棄式 postgres:15 → `public_tables=73`、**`organizations=5`**、`ops_action_runs=6` → 客戶資料證實還原得回來（不只 integrity）。註：pg_dumpall 還原進新 PG 會有 ~315 個 role/extension-already-exists 類非致命雜訊，以 data count>0 為判定。Trigger/MainWP/n8n/.env 演練待補漏項上線後補。

### 演練 A — Supabase / Trigger PG dump 真的還原得回來

```bash
# 在 EU（或任何有 docker 的機）跑，全程拋棄式，不碰 prod
OUT=$(ls -dt /root/backups/*/ | head -1)          # 取最新備份
echo "drill from: $OUT"

# 1) 起一個拋棄式 postgres
docker run -d --name drill-pg -e POSTGRES_PASSWORD=drill postgres:15
sleep 8

# 2) 灌 Supabase dump（pg_dumpall 含 CREATE ROLE/DB）
gunzip -c "$OUT/supabase-all.sql.gz" | docker exec -i drill-pg psql -U postgres 2>&1 | tail -5

# 3) 驗資料真的在（改成你的關鍵表，如 organizations / ops_action_runs）
docker exec drill-pg psql -U postgres -d postgres -c \
  "SELECT count(*) FROM organizations;" 2>&1     # 期望 > 0 = 客戶資料還活著

# 4) Trigger dump 同法（trigger.sql.gz 是單庫 pg_dump）
docker exec drill-pg psql -U postgres -c "CREATE DATABASE trigger;" 
gunzip -c "$OUT/trigger.sql.gz" | docker exec -i drill-pg psql -U postgres -d trigger 2>&1 | tail -3
docker exec drill-pg psql -U postgres -d trigger -c "SELECT count(*) FROM \"TaskSchedule\";"

# 5) 拆台
docker rm -f drill-pg
```
**判定**：步驟 3/4 的 count > 0 = ✅ 還原可行。count=0 或報錯 = 🔴 備份有問題，當天修。

### 演練 B — MainWP / n8n / volume 還原（補漏項上線後加驗）
```bash
# MainWP DB（補漏後）：灌進拋棄式 mariadb 驗 wp_options/連線表筆數
# n8n volume：docker run --rm -v drill-n8n:/d -v $OUT:/b alpine tar xzf /b/n8n.tgz -C /d
#   → 起拋棄式 n8n 掛 drill-n8n 確認 workflow 清單回得來
# TODO: 補漏項實際上線後，於下一次演練補上對應指令並定稿
```

### 演練 C — `.env` 解密驗證
```bash
# 確認加密的 .env 備份解得開（金鑰在本機 vault）
openssl enc -d -aes-256-cbc -pbkdf2 -in "$OUT/env.tar.gz.enc" | tar tzf - 2>&1 | head
# 期望列出 4 個 .env 路徑 = ✅ 密鑰救得回
```

**每次演練**：計時 RTO、記錄哪些 count 對得上、抓到什麼漏洞 → 寫 `agency-os/WORKLOG.md`（演練本身就是抓「dump 漏表 / .env 沒進集 / volume 沒涵蓋」的手段）。

---

## §7 上 Dedicated 前 Checklist（全綠才搬）

- [x] 讀懂現有 `backup-eu-stack.sh` 涵蓋範圍（2026-06-26：Supabase+Trigger PG+Uptime Kuma，異地 SG+R2）
- [ ] 補齊 §1 漏項進 `backup-eu-stack.sh`：**MainWP DB / n8n / `.env`(加密) / Supabase Storage / MinIO / MainWP files**（Medium，需 propose）
- [ ] 補第二異地取代 SG-offsite（SG 退役前）：R2 二 region 或 Hetzner Storage Box
- [ ] 備份集含**加密後**的 `.env`，金鑰存本機 vault（不同地）
- [ ] **演練還原成功一次**（§6 演練 A count>0），RTO/RPO 達標 + 寫 WORKLOG
- [ ] 確認 `verify-backup-eu.sh` 失敗有真的觸發 Telegram 告警
- [ ] auction 機：雙碟 NVMe + RAID 1 + SMART 健康 + mdadm 告警
- [ ] §4 / §5 的 `TODO:` 指令全部補齊並實測
- [ ] 所有指向 EU 的 Cloudflare DNS record 清單列出
- [ ] 原 Cloud 機保留至遷移驗證完成

---

_建立 2026-06-26。維護者：AwareWave。新增/修訂後若納入 runbook 路由，更新 `agency-os/AGENTS.md §問題症狀→Runbook 路由表`。_
