# Hetzner Phase 1 — 長期營運契約（多週期）

> **Owner（本檔）**：自架 **Phase 1 core compose**（Nginx / Redis / n8n / WordPress / Node API / Next Admin）在 **單機或小集群** 上如何**活得久、換人仍能接、出事能還原**。  
> **誠實邊界**：沒有任何一組 `docker-compose.yml` 能在 **30 年內完全不改版**；本檔追求的是 **可替換零件、可審計流程、可演練還原**，而不是鎖死某一個供應商版本號。  
> **上層紀律**：`agency-os/docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`（全 monorepo）；**資料主權（SoR）**仍在 **Supabase／Postgres** — 見 `agency-os/docs/architecture/decisions/005-supabase-sor-vs-wordpress-runtime-db.md`。  
> **可複製核對表**：[`MAINTENANCE_CALENDAR.md`](./MAINTENANCE_CALENDAR.md)（週／月／季／年）。

---

## 1. 你要固定的「營運假設」（請寫進營運筆記或 `WORKLOG`）

| 項目 | 建議至少定稿內容 |
|------|------------------|
| **RPO**（最多能接受丟多少資料） | 例如：Supabase **15 分鐘～1 小時**；WordPress **24 小時**（依更新頻率） |
| **RTO**（多久要復線） | 例如：**4 小時內**恢復對外只讀或核心 API；**24 小時內**完整恢復 |
| **備份存放** | **異地**：第二機房、物件儲存、或加密冷存；**禁止**只留在同一顆 VPS 磁碟 |
| **責任人** | 誰有權 **SSH／DNS／憑證／root DB**；輪值與 **escalation** |
| **staging** | **永遠**先升級／遷移 **staging**，再 **production**（見 §6） |

---

## 2. 威脅與最低限度防線（可驗證）

| 風險 | 最低限度 | 驗證 |
|------|----------|------|
| **祕密外洩** | `.env` 不入庫；用 vault；**季度**輪替 DB／JWT／API key | `security-secrets-policy.md` |
| **單點機器掛了** | 備份可還原；DNS／TLS 可切換；**年度**全流程還原演練 | §5、`BACKUP_RESTORE_PROOF` 類模板 |
| **日誌塞滿磁碟** | json-file **rotate**（compose 已設 `max-size`／`max-file`） | `df -h`、Docker log 目錄 |
| **橫向移動** | SSH **鎖 IP**、關密碼登入；Redis／DB **不對 0.0.0.0**；上線後關閉 **127.0.0.1 除錯埠**（見 `README.md`） | `ss -lntp`、雲防火牆 |
| **共應弱點（CVE）** | **月度**審視基礎映像；**staging** 先拉新版本 | WORKLOG 留痕 |

---

## 3. 映像與相依：**釘選策略**（Boring wins）

1. **第一原則**：production **禁止**長期漂在「未記錄的 `latest`」上 — 至少要能回答「上線當下是哪一個 digest／semver」。  
2. **建議實務**（由鬆到緊）：  
   - **A.  semver 釘選**：在 `.env` 設 **`N8N_IMAGE_TAG`** 等變數，`docker compose` 使用 `${VAR}`（見本目錄 `.env.example`）。  
   - **B. digest 釘選**（最硬）：`image: repo/name@sha256:...` — 在 **WORKLOG** 記「為何在這天升級／回滾方式」。  
3. **龍蝦自有 image**（`lobster-phase1-*:local`）：以 **Git commit SHA** 或 **日曆版本** 在 `WORKLOG` 標記「當前 production 對應哪個 repo 版本」。  
4. **PHP / MariaDB / WordPress**：大版本跳躍（例如 PHP 8.2 → 8.4）前，必做 **staging 外掛相容矩陣**（WP 生態最易卡這裡）。

---

## 4. 資料與備份：**什麼在這份 compose、什麼不在**

| 資料 | 歸屬 | 備份責任 |
|------|------|----------|
| **Supabase（Postgres／Auth／Storage）** | **SoR** | **不在**本 compose；依 `supabase-self-hosted-cutover-checklist.md`、官方備份指引 |
| **WordPress DB + `wp-content`** | 交付 runtime | `scripts/backup-phase1.sh` + **異地複本** |
| **n8n 工作流與憑證** | 膠水層 | 卷 **`n8n_data`** 納入**與 WP 同等級**的備份策略（建議另做 volume 級備份或定期 export） |
| **Redis** | 快取／鎖 | 多數情境 **可重建**；若日後放進 **佇列／觸發狀態**，備份策略要升級 |

**還原演練（強制節奏）**：至少 **每年 1 次**、重大改版前 **1 次**，在 **隔離 VM** 還原備份直到 `curl`／瀏覽器驗收通過；證據可仿 `tenants/templates/core/BACKUP_RESTORE_PROOF.md`（若貴司已採用）。

---

## 5. TLS、DNS、憑證生命週期

- **目標**：對外僅 **443**（與必要的 **80** 驗證）；HTTP plain 僅作過渡。  
- **實作選型（長期 boring）**：Let’s Encrypt + **自動續期**（Certbot、Caddy、或 Traefik）— **定稿與證據**留在獨立 runbook 或 `WORKLOG`；本 repo 不綁死單一工具，以免文件與上游生命週期脫節。  
- **續期失敗**：需有 **監控或 cron 告警**（信箱／Slack／現有 system-guard）；憑證過期屬 **P1 incident**。  
- **`WORDPRESS_PUBLIC_URL`**、**`N8N_WEBHOOK_URL`**：改 **https** 時必同步 `.env` 並 **重建／重啟**依賴公開 URL 的服務（Next 的 `NEXT_PUBLIC_*` 須 **rebuild**）。

---

## 6. 升級與變更節奏（建議日曆）

| 頻率 | 動作 | 產物 |
|------|------|------|
| **每週** | 看主機 **磁碟／安全更新**（`unattended-upgrades` 或固定維護窗） | 簡短 WORKLOG（若無異常可「本週無」） |
| **每月** | 審 **映像 CVE**、閱讀 n8n／WP **security release** | 決定是否 PATCH；staging 先行 |
| **每季** | **祕密輪替**、備份還原 **smoke**、檢查 DNS／TLS 到期日 | 輪替紀錄（不含祕密本體） |
| **每年** | **完整災難還原演練**、審視 **RPO/RTO** 是否仍成立 | `BACKUP_RESTORE_PROOF` 或內部報告 |
| **重大升級** | Postgres／Supabase、MariaDB **大版本**、n8n **大版本** | **ADR 級**決策 + staging 證據 + 回滾步驟 |

---

## 7. 何時「整包汰換」仍算成功（韌性，不是認輸）

若未來出現下列訊號，**計畫性遷移**優於無止盡補丁：

- 單機 Docker 無法滿足 **合規／可用性 SLA**（多區、專用 K8s、受管服務）。  
- **人力 bus factor** 無法維持自建堆疊（改 **受管 n8n／受管 Redis** 等）。  
- **WordPress** 僅剩展示而 **商業邏輯已完全遷出** — 考慮靜態化或極簡 runtime。

屆時：在此檔 **加一段 ADR 連結**，說明 **資料如何從 SoR 流出／切入點為何**，避免「只有 Docker 大神知道怎麼搬走」。

---

## 8. Related（單句 + 連結，避免雙寫）

- 安裝順序／平面／連動索引：`agency-os/docs/operations/hetzner-stack-rollout-index.md`  
- 週期勾選：`MAINTENANCE_CALENDAR.md`  
- 操作入口：`README.md`  
- 全棧階段：`agency-os/docs/operations/hetzner-full-stack-self-host-runbook.md`  
- Supabase 切線：`agency-os/docs/operations/supabase-self-hosted-cutover-checklist.md`  
- 祕密政策：`agency-os/docs/operations/security-secrets-policy.md`  
- 工具邊界：`lobster-factory/docs/MCP_TOOL_ROUTING_SPEC.md`  
- Monorepo 長期紀律：`agency-os/docs/overview/LONG_TERM_OPERATING_DISCIPLINE.md`

## Related Documents (Auto-Synced)
- `docs/operations/hetzner-stack-rollout-index.md`

_Last synced: 2026-04-06 07:49:28 UTC_

