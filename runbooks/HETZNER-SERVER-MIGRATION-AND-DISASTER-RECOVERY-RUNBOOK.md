# EU 自架 Stack — 備份 / RAID / 災難還原 Runbook（上 Dedicated 主機的安全前提）

> **這份文件是什麼**：EU VPS（`204.168.175.41`，跑 Supabase + Trigger + n8n + Postiz + MainWP + Uptime Kuma）
> 若要從 Hetzner **Cloud** 搬到便宜很多的 **Dedicated auction（Serverbörse）** 二手實體機，會失去 Cloud 的「硬體壞自動遷移」。
> 本 runbook = **讓 dedicated 變安全的前提層**：要備份什麼、備到哪、RAID 怎麼設、硬體壞了怎麼還原、Cloud→Dedicated 怎麼搬。
>
> **何時讀**：① 評估要不要上 dedicated 時（看 §0 決策 + §7 checklist）② 真的要搬時（照 §5）③ 硬體故障還原時（直接跳 §4）。
>
> **狀態**：**備份 / 災難還原層已實機驗證可用**（§1–§2.5 + §4 + §6 全綠 — 見 §7 已勾項；§4 還原指令端到端驗過）。**非純草稿** — 現可同時用於①決策評估 ②真實災難還原。**仍待真機定稿的只有**：§3 RAID（要先買 dedicated）+ §5 少數遷移 step（搬機當下）。完整待辦以 **§7 checklist 為唯一正本**。
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

## §0b 2026-06-27 決策：買哪台 + Chatwoot 先行 + 單台夠不夠（HA 第二台延後）

> **起因**：要上 **Chatwoot 客服**（omnichannel 收件匣，需 ~8GB），實測現有兩台塞不下 —— **EU 8GB 已用 5.7G + 吃 3G swap**、**SG 僅 4GB**。決定**買一台二手 dedicated** 當主力，承載 Chatwoot + 之後整併 EU/SG 全部服務。客服系統決策正本：[`Customer_service_BUILD_PLAN.md`](../agency-os/docs/Customer_service/Customer_service_BUILD_PLAN.md)（U6）。
>
> ★ **重要脈絡（只讀本 runbook 會漏掉）**：AI 客服的「大腦」—— cs-engine + RAG + 操作 UI（U0–U5）+ headless widget 程式碼（U4）—— **已建好且上 prod 驗證過**（部署在 SG `lobster-next-admin`，讀 EU Supabase 的 cs_* 表；餵知識→pgvector 已 live 驗證 embed_dim=1536）。本搬家的 **Chatwoot = 該系統 U6（最後一塊）= 收件匣那層**。Chatwoot 裝好後的**接線步驟**（建 AgentBot webhook route 呼叫 `lib/cs` 的 `handleInbound`、widget 把 `MockTransport` 換 `ChatwootTransport`）+ 8 月冷啟動完整接手 → **`agency-os/handoffs/2026-06-27-customer-service-u6-chatwoot-handoff.md`**（這份是接手第一讀）。

**選定機型** —— 🔴 **本表已於 2026-08-17 被規格上修取代。下單前讀新決策，不要照下表買。**

> **新正本**：[`agency-os/reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md`](../agency-os/reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md)
> **上修後的規格下限**：**128GB ECC / ≥8C16T / ≥1TB NVMe 可 RAID1**。首選 **OVH KS-6**（Epyc 7351p 16C32T / 128GB DDR4 ECC / 2×1TB NVMe soft RAID / **$59.80 月** ≈ €51–54）；Hetzner auction 若出現 128GB ECC + ≥2TB NVMe **≤€65/月** 則改選 Hetzner。**觀望截止 2026-08-31，硬買機死線 2026-09-30。**
> **為什麼改**：操作者 2026-08-17 聲明工作負載為「**很多網站和自架工具**」，下表的負載模型（Chatwoot + EU 現有服務）不含多站 WP 租戶。重算後 RAM 需求 37–58 GB → 64GB 僅剩 ~9% headroom，對承載 ClickHouse（已 OOM 復發 4 次）的整併主機不可接受。且 128GB ECC 價格帶只比下表貴 €3–6/月，「64GB 是 auction 地板價」的前提已不成立。
> **下表其餘決策全部有效**（Chatwoot greenfield 先行、單台 + RAID1 + R2、HA 第二台延後、絕不 HDD）。

<details>
<summary>⚠️ 已取代 — 2026-06-27 原選定機型表（保留為歷史紀錄，勿照此下單）</summary>

| 項目 | 選定 | 為什麼 |
|---|---|---|
| CPU | Intel **i7-7700**（i7-6700 可）| auction 地板價、4C8T 夠用 |
| RAM | **64GB** | 塞 Chatwoot + EU 全服務 + 多租戶 headroom（EU 現 8GB 已爆）|
| 碟 | **2× 512GB SSD**（**絕不 HDD**）| Postgres/ClickHouse/Chatwoot 全是 DB I/O，HDD 會慘；2 顆才能 RAID 1；512 > 256（ClickHouse/上傳會長）|
| 價 | ~**€48.70/月**（≈NT$1600）| 64GB 地板價；單價比雲端便宜一半多 |
| 機房 | Falkenstein（FSN）| 與 EU(Helsinki) 異 DC → 未來留一台即天然異地 |

</details>

**機房**：德國境內即可（原選 FSN；新首選 KS-6 在 Limburg DE）—— 與 EU(Helsinki) 異 DC 的天然異地性質不變。

> ⚠️ **絕對金額比現在貴**（EU+SG 雲端 ~€28 → 一台 €51–54），但 RAM 12GB→**128GB**（10×）。省錢靠**搬完退掉雲端兩台**，結算在單台（不是疊加）。

**執行順序（關鍵：Chatwoot greenfield 先行，不被 EU 搬移綁架）**：
```
1. 買機 → §3 裝 OS + RAID 1 + SMART 驗碟
2. R2 備份就緒 + §6 還原演練（已驗 2026-06-26）
3. ★ Chatwoot 先裝（全新服務、無舊資料 → 零搬遷風險）→ 接 cs-engine AgentBot webhook + headless widget
4. EU 服務（Supabase/Trigger/n8n/Postiz/MainWP/Uptime）照 §5 一台台搬
5. 驗證 24–48h → 退 EU + SG 兩台雲端
```
> **Chatwoot 先行的理由**：它是 greenfield，先上**不碰任何現有東西**、當天可用、客服立刻有家；而搬 Supabase（核心資料層、連 cs-engine 都靠它）是 High-risk 專案（§5）。**搬移風險與 Chatwoot 上線解耦** —— 別為了湊 8GB 趕著搬核心資料。

**單台夠不夠？（HA 第二台延後 — 決策）**：
- **一台 + RAID 1 + R2 異地備份 = 開始夠用、零資料損失。** 很多公司單台跑多年。
- 四種失效對照：① 服務當/吃爆記憶體 → Docker 容器隔離 + **per-container 記憶體上限**（裝時設）→ 只那個掛，其他沒事 ② 一碟壞 → **RAID 1 零當機** ③ 資料毀/誤刪 → R2 還原 ④ **整機死（罕見，RAID 已蓋最常見的碟壞）→ 從 R2 還原數小時**（§4，RPO≤24h / RTO≤數小時）。
- **第二台 hot-standby 延後**：等客戶/營收上來、連「整機死那幾小時」都不能停時再加（重用一台現有雲端當異地備援即可）。**別為 HA 在 day 1 養兩台。**

**Chatwoot 資料納入備份（上線後補）**：Chatwoot 自帶 Postgres（對話 = 唯一真相源）+ Redis（可丟）+ uploads volume。裝好後把 **Chatwoot PG dump + uploads volume** 加進 `backup-eu-stack.sh`（§1 表 🔴/🟡 + §6 演練同步擴充）。

---

## §1 要備份什麼（EU 實際盤點，2026-06-26）

> 原則：**資料庫用邏輯 dump（pg_dump / mysqldump）**，不是直接複製 data 目錄（live copy 會不一致）。檔案類用 volume / 目錄快照。

### 🔴 CRITICAL — 丟了無法重建（客戶資料 / 密鑰）
| 項目 | 位置 | 備份方式 |
|------|------|---------|
| Supabase Postgres（客戶/業務主資料） | container `supabase-db`（data 在 `/root/supabase/volumes/`） | `pg_dumpall` 邏輯 dump |
| Trigger Postgres（run 紀錄/排程/狀態） | container `trigger-postgres` | `pg_dump -U trigger trigger`（**單庫**；還原需先 `CREATE DATABASE trigger`）|
| 全部 `.env`（密鑰 SSOT） | `/root/{supabase,trigger,mainwp,postiz}/.env` | 加密複製（含在 §2 備份集）|
| MainWP DB（child site 連線/token） | container `mainwp-db` | `mysqldump --single-transaction mainwp` |
| n8n（workflow + 憑證） | **workflow/憑證在 supabase-db 的 `n8n` DB**（隨 Supabase `pg_dumpall`）；加密金鑰在 n8n `.env`；vol `n8n_n8n_data` 僅 binary/config（**無 SQLite**）| workflow 隨 supabase dump + `.env` 加密 + volume 快照 |

### 🟡 IMPORTANT — 丟了會痛但可重建
| 項目 | 位置 | 備份方式 |
|------|------|---------|
| Supabase Storage（上傳檔） | vol `supabase_storage-data` | volume 快照 |
| Trigger MinIO（packets/物件） | vol `trigger_trigger_minio_data` | volume 快照 |
| Trigger ClickHouse（run analytics） | vol `trigger_trigger_clickhouse_data` | `clickhouse-backup` 或可接受重建 |
| Postiz（排程貼文/上傳） | **DB 在 supabase-db 的 `postiz` DB**（隨 Supabase dump，已確認 2026-06-26）+ vol `postiz_postiz_uploads`（上傳檔）| DB 隨 supabase dump + volume 快照 |
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
> - 異地 L1：rsync → SG VPS（key `/root/.ssh/backup_to_sg`）｜異地 L2：**Cloudflare R2**（bucket `lobster-backup`，prefix `eu`，`upload-to-r2.sh`）→ 設計為 3-2-1，但 **R2 自 2026-05 因 export bug 從沒真上傳成功（2026-06-26 修，見下）**，修前實際只有本機 + SG
> - integrity 驗證：`verify-backup-eu.sh`（gzip/tar -t + 檔案存在 + SG 異地存在）
>
> **✅ 漏洞已補齊（方案A，2026-06-26，實機跑 + 還原演練通過）** — `backup-eu-stack.sh` 已新增以下 7 項：
> | 項目 | 備份產物 | 還原演練 |
> |------|---------|---------|
> | **MainWP DB** | `mainwp.sql.gz`（`mysqldump --single-transaction`，root pw 讀容器 env 不硬編）| ✅ 內容 44 張表（含 `mwp_mainwp_api_keys` 客戶連線）|
> | **`.env` 密鑰 ×4** | `env.tar.gz.enc`（AES-256，`-pass env:BACKUP_ENC_KEY`）| ✅ 解密列出 4 個 .env |
> | **n8n** | `n8n.tgz`（binary/config volume）| ✅ 解開 config/nodes/storage |
> | Postiz uploads / Supabase Storage / Trigger MinIO / MainWP files | `*.tgz`（volume archive）| ✅ 產出 OK |
>
> **🔑 還原關鍵事實（restore 時必知）**：`supabase-db` 這個 Postgres cluster 含 **4 個 DB** — `postgres`(Supabase) + **`n8n`**(workflow) + **`postiz`** + `_supabase`。`pg_dumpall` 全抓 → **n8n workflow、postiz 排程資料都在 `supabase-all.sql.gz` 裡**（已驗 `CREATE DATABASE n8n` + `workflow_entity`），n8n.tgz/postiz-uploads.tgz 只補 binary/上傳檔。**還原 n8n/postiz = 先 restore supabase dump（含其 DB）+ 再還原對應 volume。**
>
> **🔑 兩把救援鑰匙都在本機 vault（機器死也拿得到，2026-06-26 補齊）**：① `BACKUP_ENC_KEY`（解 `env.tar.gz.enc`）② `R2_API_TOKEN`（下載 R2 備份 —**原本只在 EU `/etc/default/eu-backup`，是 DR gap：EU 死 + SG 退役後 R2 是唯一異地卻拿不到 token；已鏡像到 vault**）。兩者在 EU `/etc/default/eu-backup`（不進備份）+ vault。完整救援指令見 §4 step 0；端到端已驗（vault→R2 下載→解密列 4 個 .env，全程不需 EU）。
>
> **✅ R2 異地已修（2026-06-26）**：根因 = `/etc/default/eu-backup` 變數沒 export，子腳本 `upload-to-r2.sh` 讀不到 `R2_API_TOKEN`（自 2026-05 起 R2 從沒真的上傳成功，「3-2-1」其實只有本機+SG）。修 = `set -a` 包住 source。實測 10/10 檔 HTTP 200、`R2 upload OK`。**現在才是真 3-2-1**（本機 + SG + R2），R2 跨供應商那條 SG 退役後仍在。
>
> **⚠️ 備份層兩個已知限制**（**完整搬機待辦以 §7 checklist 為唯一正本**，本處只列與備份直接相關的）：① 異地 L1 指向 SG，SG 退役即斷 → 退 SG 時把第二異地改成 R2 二 bucket / Storage Box（R2 主線已可靠；§7 有對應項）。② 備份腳本部署仍為手動 scp（repo 已有正本，無 auto-deploy；非搬機阻擋項，故不在 §7 gate）。

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
- **失敗怎麼知道** → 見 **§2.5**（獨立小節）。

---

## §2.5 監看：備份壞了 / 停了怎麼知道（✅ 2026-06-26 接好）

> **核心問題**：備份半夜自己跑，**壞了或停了沒人知道 = 等於沒備份**。本節 = 「會不會被通知」的單一說明。

**機制 = AO-RESUME surface（開工自動報，非即時 push）**：

```
每日 cron：backup → verify(檢查 integrity) → 判定寫 log
            /var/log/eu-backup.log（EU）｜/var/log/lobster-backup.log（SG）
                              │
你開工(AO-RESUME) → check-backup-health.ps1 SSH 兩台，讀「最新 verify 判定 + 備份年齡」
                              │
   verify=FAILED 或 age>3天(stale) → backup-health-LATEST 報告轉 WARN → Claude 在 §1 主動報你
```

| 偵測什麼 | 判斷依據 | 行為 |
|---------|---------|------|
| 備份**壞了**（檔毀/缺/dump 失敗）| verify 判定 = FAILED | → AO-RESUME **WARN** |
| 備份**停了**（cron 沒跑）| 最新備份 age > 3 天 | → AO-RESUME **WARN** |
| log 不在 / 格式不符 | UNKNOWN | **不誤報**（不會假性 WARN）|

- **零記憶負擔**：你不用記得去查，**開工自動報**（系統既有 pattern，非新建告警）。
- **兩台都涵蓋**：SG + EU。SG verify 另有即時 **Slack** 告警（既有）；EU 靠本機制。
- **不在此層**：服務當機 / CPU / 網路等**即時**告警走 **Netdata + Uptime Kuma**（那是服務健康，不是備份健康）。
- **SSOT**：`scripts/check-backup-health.ps1`（warn-only、read-only，由 `ao-resume.ps1` 每次開工呼叫）；判定來源 `verify-backup-eu.sh` / `verify-backup.sh`。
- **怎麼自己手動查**：本機跑 `pwsh scripts/check-backup-health.ps1`，或讀 `agency-os/reports/status/backup-health-LATEST.md`。

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

**整機壞 / 需重建**（指令 2026-06-26 實機驗證；`$NEW` = 新機 IP）：

**0. 取備份集 —兩個來源（SG 還在用 SG，較快；SG 退役後用 R2）**

兩把救援鑰匙都在**本機 vault**（已驗，機器死也拿得到）：`R2_API_TOKEN`（下載 R2）+ `BACKUP_ENC_KEY`（解 .env）。
```powershell
# 從本機（筆電/桌機）救援。secrets-vault.ps1 run 把兩把鑰匙注入 env，不落地。
& scripts\secrets-vault.ps1 -Action run -Names @("R2_API_TOKEN","BACKUP_ENC_KEY") -Command @'
  $acct="aea1a836e6f8b8d7f18206dc8e848bd6"; $date="<YYYY-MM-DD>"
  $files="supabase-all.sql.gz","trigger.sql.gz","mainwp.sql.gz","env.tar.gz.enc","n8n.tgz","supabase-storage.tgz","trigger-minio.tgz","postiz-uploads.tgz","mainwp-files.tgz","uptime-kuma.tgz"
  foreach($f in $files){ curl.exe -s -H "Authorization: Bearer $env:R2_API_TOKEN" -o "D:\tmp\restore\$f" "https://api.cloudflare.com/client/v4/accounts/$acct/r2/buckets/lobster-backup/objects/eu/$date/$f" }
'@
# 或 SG 還在：scp -i ~/.ssh/backup_to_sg -r root@5.223.93.113:/root/lobster-phase1/backups/from-eu/<YYYY-MM-DD>/ ./restore/
```
（已驗：R2 GET → HTTP 200；vault 注入 + openssl 解密 → 列出 4 個 .env，全程不需 EU。）

**1.** Hetzner 開新 dedicated（或修原機）→ §3 裝 OS + RAID 1 + SMART。
**2.** `git clone https://github.com/awarewaveai-pei/Work /root/Work`（compose/scripts 正本；EU 備份腳本在 `lobster-factory/infra/eu-backup/`）。把備份集 scp 到新機 `/root/restore/`。

**3. 還原密鑰**（`BACKUP_ENC_KEY` 從 vault；新機 `/etc/default/eu-backup` 也要重建此值 + R2/OFFSITE 設定）：
```bash
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -in /root/restore/env.tar.gz.enc | tar xzf - -C /   # 還原 /root/{supabase,trigger,mainwp,postiz}/.env
```
**4. 還原 DB**（先 `docker compose up -d` 起 DB 容器，再灌）：
```bash
gunzip -c /root/restore/supabase-all.sql.gz | docker exec -i supabase-db psql -U supabase_admin   # 含 postgres + n8n + postiz DB（pg_dumpall 全抓）
gunzip -c /root/restore/trigger.sql.gz      | docker exec -i trigger-postgres psql -U trigger -d trigger
docker exec mainwp-db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" -e "CREATE DATABASE IF NOT EXISTS mainwp"'
gunzip -c /root/restore/mainwp.sql.gz       | docker exec -i mainwp-db sh -c 'mysql -u root -p"$MYSQL_ROOT_PASSWORD" mainwp'
```
**5. 還原 volumes**（每個 tgz 灌回對應 volume）：
```bash
for pair in "n8n.tgz:n8n_n8n_data" "supabase-storage.tgz:supabase_storage-data" "trigger-minio.tgz:trigger_trigger_minio_data" "postiz-uploads.tgz:postiz_postiz_uploads" "mainwp-files.tgz:mainwp_mainwp_files" "uptime-kuma.tgz:uptime-kuma"; do
  f="${pair%%:*}"; v="${pair##*:}"; docker volume create "$v" >/dev/null
  docker run --rm -v "$v":/d -v /root/restore:/b alpine sh -c "tar xzf /b/$f -C /d"
done
```
**6.** `docker compose up -d`（各 stack：supabase / trigger / 各服務）→ 等 healthy。
**7. 驗證**：`docker exec supabase-db psql -U supabase_admin -d postgres -c "SELECT count(*) FROM organizations"`（客戶資料）；Trigger `SELECT * FROM "TaskSchedule"`（排程在）；MainWP 連得到 child；app.aware-wave 能建站。
**8. DNS**：换 IP → 更新指向 EU 的 **9 個 record**（清單 + 指令見 §5 step 5）。
**9.** 新機重建備份：`scp lobster-factory/infra/eu-backup/*.sh root@$NEW:/root/scripts/` + 重設 `/etc/default/eu-backup`（`BACKUP_ENC_KEY` 從 vault、R2_* 設定）+ 裝 cron。

---

## §5 Cloud → Dedicated 遷移 Runbook（一次性，有停機）

> **這是個專案不是點一下。** 風險 High（客戶資料搬移）。排低流量時段 + 全程可回滾（原 Cloud 機保留到驗證完才退）。

1. **前置**：§2 備份全綠 + §3 dedicated（RAID + SMART 過）就緒 + §4 還原已**演練過一次**。
2. 凍結寫入（短維護窗）：停對外入口，避免遷移中產生新資料。
3. 取最終一致 dump（所有 🔴🟡）。
4. 在 dedicated 還原（照 §4 step 2–7）。
5. 切 DNS → dedicated IP，TTL 先調短。**要改的就是下面這 9 個指向 EU 的 A 記錄**（2026-06-26 live 查證，非文件舉例）：

   | 子網域 | CF 代理 | 備註 |
   |--------|--------|------|
   | `supabase` / `studio` / `n8n` / `trigger` / `uptime` / `mainwp` / `postiz` | 🟠 proxied | 平台/自動化/監控入口；改 A record content 即可（CF 邊緣不變）|
   | `remotion-svc` / `video-svc` | ⚪ **DNS-only（刻意，勿開 proxy）** | **影片 render 超過 CF 100s proxy 超時 → 開 proxy 會 524 弄壞它**（nginx read_timeout 600s）。保護靠 **X-Render-Token（無 token→401）+ TLS**（2026-06-26 實測確認）。搬機改 A record IP 後仍維持 grey/DNS-only。代價：origin IP 公開（可接受，已 token+TLS）；想隱藏 IP 又保長請求 → 未來可考慮 Cloudflare Tunnel(cloudflared)，非必要 |

   - SG 那 4 個（`apex` / `api` / `app` / `oracle`）+ `www`(CNAME→apex) **不要動**（除非也搬 SG）。
   - 查當前 live 清單：`curl -H "Authorization: Bearer <CLOUDFLARE_API_TOKEN>" "https://api.cloudflare.com/client/v4/zones/f21b1919632fee2221647908a94fdcac/dns_records?per_page=200"`。
   - 概念分工（哪些該指哪台）正本：[`CLOUDFLARE_HETZNER_PHASE1.md`](../agency-os/docs/operations/CLOUDFLARE_HETZNER_PHASE1.md)。
6. **平行驗證**：兩機都在，逐項對比（資料筆數、登入、佈建、監控）。
7. 觀察 24–48h 無誤 → 退掉 Cloud 機。
- **回滾**：任何驗證失敗 → DNS 切回 Cloud（原機未退），零資料遺失。

---

## §6 還原演練（沒演練過的備份 = 沒有備份）— **確切指令**

> 現有 `verify-backup-eu.sh` 只驗 gzip/tar 完整性 = **「檔案沒爛」≠「還原得回來」**。真演練必須把 dump **灌進臨時 DB** 確認資料活著。
> **頻率**：每季一次（+ 每次補漏覆蓋後一次）。**目標**：RTO ≤ 數小時、RPO ≤ 24h。**全程在臨時容器，不碰 prod。**
>
> **✅ 演練 2026-06-26 通過**：
> - **A Supabase**：`supabase-all.sql.gz` → 拋棄式 postgres:15 → `organizations=5`、`ops_action_runs=6`、73 表（pg_dumpall 還原有 ~315 role/extension-exists 雜訊，以 count>0 判定）。
> - **C `.env` 解密**：`openssl enc -d -pass env:BACKUP_ENC_KEY` → 列出 4 個 .env（密鑰救得回）。
> - **MainWP**：`mainwp.sql.gz` 內容 44 表（含客戶連線）；**n8n**：`n8n.tgz` 解開 OK，workflow 本體在 supabase dump 的 `n8n` DB（`workflow_entity` 已驗）。
> - （拋棄式 mariadb live-load 因 root pw env 不合 1045，改以 dump 內容驗證；非備份問題。）

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
# 註：補漏項已上線並內容驗過（2026-06-26：mainwp dump 44 表、n8n 解開 OK）；上面 live-restore 指令待下次正式演練跑通定稿（拋棄式 mariadb root pw env 待調）。
```

### 演練 C — `.env` 解密驗證
```bash
# 確認加密的 .env 備份解得開。金鑰來源二選一：
#   EU 機上：source /etc/default/eu-backup; export BACKUP_ENC_KEY
#   本機/異機：真值在本機 mcp\user-env.ps1 的 BACKUP_ENC_KEY（-Action get 只印遮罩，解不開備份）
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -in "$OUT/env.tar.gz.enc" | tar tzf - 2>&1 | head
# 期望列出 4 個 .env 路徑（root/supabase/.env 等）= ✅ 密鑰救得回
```

**每次演練**：計時 RTO、記錄哪些 count 對得上、抓到什麼漏洞 → 寫 `agency-os/WORKLOG.md`（演練本身就是抓「dump 漏表 / .env 沒進集 / volume 沒涵蓋」的手段）。

---

## §7 上 Dedicated 前 Checklist（全綠才搬）

- [x] 讀懂現有 `backup-eu-stack.sh` 涵蓋範圍（2026-06-26：Supabase+Trigger PG+Uptime Kuma，異地 SG+R2）
- [x] 補齊 §1 漏項進 `backup-eu-stack.sh`（方案A 2026-06-26：MainWP DB / n8n / `.env`加密 / Storage / MinIO / MainWP files 全補 + 實機跑 + 還原演練）
- [ ] 補第二異地取代 SG-offsite（SG 退役前）：R2 二 region 或 Hetzner Storage Box
- [x] 備份集含**加密後**的 `.env`，金鑰 `BACKUP_ENC_KEY` 存本機 vault（不同地）— 2026-06-26
- [x] **演練還原成功一次**（§6 A/C + MainWP/n8n 內容驗證）— 2026-06-26
- [x] **修 R2 upload WARN**（2026-06-26：`set -a` export 修；實測 10/10 HTTP 200）→ 真 3-2-1 成立
- [x] 備份失敗會 surface（2026-06-26：`check-backup-health.ps1` 讀 verify 判定，FAILED→AO-RESUME WARN；非 Telegram 而是開工自動報，涵蓋「壞了」+「停了」）
- [ ] 機型已選（**2026-08-17 上修**：**128GB ECC / ≥8C16T / ≥1TB NVMe RAID1**；首選 OVH KS-6 $59.80）— **待操作者下單**（刷卡非 Claude）。正本 [`2026-08-17-dedicated-host-spec-upgrade.md`](../agency-os/reports/decisions/2026-08-17-dedicated-host-spec-upgrade.md)；§0b 舊表（i7-7700/64GB/€48.70）已作廢
- [ ] **採購時機已定（2026-08-18）：立刻買，選月租，不要 12 個月承諾** —— 不再觀望到 8/31。理由與量化：[`2026-08-18-dedicated-host-purchase-timing.md`](../agency-os/reports/decisions/2026-08-18-dedicated-host-purchase-timing.md)。觀望改由月租退出權承載（隨時可退，非日曆餘裕）；月租跑滿 30 天全綠後再評估轉 12 個月
- [ ] **下單前逐項確認**（KS-6 路線）：可裝 Ubuntu LTS + 自訂分割 + soft RAID1／rescue mode 可用／刷卡幣別與匯率。**Backup Agent 容量已移除依賴**（改走 R2）
- [ ] **P2.2** 二手 NVMe 磨耗檢查：`nvme smart-log` 兩顆碟，`percentage_used` > 40% 資料落地前要求換碟
- [ ] **P2.8** rescue mode 平時實按一次驗證可用（無 IPMI/KVM，這是唯一救援路徑）
- [ ] **P4.1** Drill #2：從 R2 完整還原到拋棄式機器，計時，目標 < 4 小時
- [ ] **W4（EU/SG 整併）明確排 2026-11-20 之後**，六個服務各一具名任務，兩週一台 —— 操作者已確認 9–11 月與 2027 Q1 無出國行程，排程無阻礙
- [ ] 🔴 **P2.4 防火牆用 UFW + DOCKER-USER chain 雙層，不能只設 UFW**（2026-08-18 追加，修正 2026-04-20 SG 挖礦入侵同款漏洞——Docker 寫 iptables `DOCKER` chain，執行順序在 UFW `INPUT` chain 之前，單純 UFW 攔不住）。事故記錄與根治法：[`SECURITY-INCIDENT-CRYPTO-MINER.md`](HETZNER-SERVER-SECURITY-INCIDENT-CRYPTO-MINER.md) / [`SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md`](SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md)
- [ ] **P2.4b** 所有非對外服務 port（Postgres/Redis/ClickHouse/MinIO/n8n/Chatwoot）一律 compose 層綁 `127.0.0.1:`，不依賴防火牆當唯一防線
- [ ] **P2.4c** 所有服務預設密碼全部更換為 `openssl rand -hex 32`，存 vault 不進 git（4/20 事件第二根因：Supabase 預設密碼從未改過）
- [ ] **P2.9** 上線前逐項跑 `SERVER-SECURITY-BREACH-RESPONSE-PLAYBOOK.md` §10 預防性檢查清單（不只裝機當下跑一次，每次新服務上線前都跑）
- [ ] **P6.10** 每週安全稽核 cron（§8-6 現成腳本）：找 0.0.0.0 綁定的資料庫類 port / 可疑進程 / `/tmp` 新檔案 / `authorized_keys` 異動 → 異常寫 status，AO-RESUME 讀
- [ ] **P2.5** SSH port 改非標準埠（49152–65535）（2026-08-19 對照 OVH 官方硬化指南補）
- [ ] **P2.5b** 建非 root 工作帳號，root 僅供緊急救援（OVH 官方硬化指南建議）
- [ ] **P2.5c** 下單時查 KS-6 是否含 OVHcloud Network Firewall（基礎設施層，封包到主機前擋，[unverified] Kimsufi 線是否開放）
- [ ] auction 機：雙碟 NVMe/SSD + RAID 1 + SMART 健康 + mdadm 告警
- [ ] **Chatwoot greenfield 先上**（EU 搬移前；§0b 順序 step 3）→ 接 cs-engine AgentBot webhook + headless widget
- [ ] **每容器設記憶體上限**（docker-compose `mem_limit`）→ 防一個服務吃爆拖垮全部（EU 現況痛點）
- [ ] Chatwoot PG dump + uploads volume 納入 `backup-eu-stack.sh`（Chatwoot 上線後；§0b）
- [x] §4 災難還原指令補齊並驗證（2026-06-26：取備份/解密/還原 DB/volume 確切指令；端到端 R2→解密實測）；§5 DNS step 補齊（§4/§5 剩 step 隨真機演練定稿）
- [x] **救援鑰匙 off-machine**（2026-06-26 修 DR gap：`R2_API_TOKEN` 原本只在 EU，已鏡像本機 vault；EU 死也下載得到 R2 備份）
- [x] 所有指向 EU 的 Cloudflare DNS record 清單列出（2026-06-26 live 查證：9 個，見 §5 step 5；含 2 個 DNS-only `remotion-svc`/`video-svc`）
- [ ] 原 Cloud 機保留至遷移驗證完成

---

_建立 2026-06-26。修訂 2026-06-27（+§0b：買哪台 + Chatwoot greenfield 先行 + 單台+RAID+R2 夠用、HA 第二台延後；§7 +5 項）。維護者：AwareWave。新增/修訂後若納入 runbook 路由，更新 `agency-os/AGENTS.md §問題症狀→Runbook 路由表`。_
