# Phase 1 維護日曆（可列印／可複製）

> **敘事與原則**：見 [`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md)（Owner）。  
> **用法**：每次做完在 **外部**行事曆打勾，並在 `agency-os/WORKLOG.md` **一句話**留痕（不含祕密）。

---

## 每週（或每次維護窗）

- [ ] 主機 **`df -h`**、inode、Docker 儲存空間正常  
- [ ] **`docker compose ps`** 無異常重啟循環；必要時 `docker compose logs -f --tail=200 <service>`  
- [ ] *(自動)* **VPS 套件升級 + auto-reboot** 每日 20:00 UTC (= 04:00 TPE) — `unattended-upgrades` 裝 security patch，若觸發 `/var/run/reboot-required` 則同時段自動 reboot。SSOT：[`auto-reboot/52awarewave-auto-reboot.conf`](./auto-reboot/52awarewave-auto-reboot.conf)；runbook：[`../../../runbooks/VPS-AUTO-REBOOT-RUNBOOK.md`](../../../runbooks/VPS-AUTO-REBOOT-RUNBOOK.md)。**人工介入時機**：若 netdata `post_update_reboot_status` 訊號 ≥ 16 小時未消失 → 自動化失敗，走 `/sg-reboot` 或 `/eu-reboot` 手動 runbook  
- [ ] *(自動)* **Docker weekly cleanup** 每週日自動執行（SG 03:00 UTC、EU 03:30 UTC）；抽查 `tail -30 /var/log/docker-weekly-cleanup.log` 確認無異常

---

## 每日（自動）

- [x] **Daily backup** `02:00 UTC (SG)` — `backup-phase1.sh` 自動執行：WordPress DB + uploads + n8n volume → 本機 `${BACKUP_DIR}`；若設定 `RCLONE_REMOTE` 則同步異地
- [x] **Daily verify** `02:30 UTC (SG)` — `verify-backup.sh` 自動驗證檔案完整性（gzip/tar integrity）；失敗時發 Slack 告警
- [x] **Retention（本機）** — 自動清除超過 `BACKUP_RETAIN_DAYS`（預設 7 天）的本機備份
- [x] **Retention（異地）** — 自動清除超過 `OFFSITE_RETAIN_DAYS`（預設 14 天）推到對方機器的副本（2026-08-12 新增）。原則：**誰推送誰負責清理**；只在推送成功後才清，推送失敗不刪歷史

## 每月

- [ ] **基礎映像 CVE**：n8n、WordPress、MariaDB、Redis、Nginx — 有無 **緊急安全釋出**（有則 **staging 先**）
- [ ] **備份**：`tail -200 /var/log/lobster-backup.log` 確認無 FAIL；抽查 **異地** 是否收到檔案（`rclone ls $RCLONE_REMOTE/`）
- [ ] **Supabase（SoR）**：依 monorepo **`agency-os/docs/operations/supabase-self-hosted-cutover-checklist.md`**／營運 SOP 的備份與監控（**不在**本 compose 內）

---

## 每季

- [ ] **祕密輪替**：DB root／WP DB user／API keys（依 monorepo **`agency-os/docs/operations/security-secrets-policy.md`**）  
- [ ] **`N8N_IMAGE_TAG`**（及其他第三方 tag）：是否仍 **刻意**使用 `latest`？production 應 **semver 或 digest**（見 `LONG_TERM_OPS.md` §3）  
- [ ] **TLS／DNS**：憑證到期日、自動續期是否正常  
- [ ] **防火牆**：SSH 仍限來源？未對外開 DB／Redis？

---

## 每年（至少一次）

- [ ] **災難還原演練**：在 **隔離 VM** 還原 WP DB+檔案與 n8n 卷策略；Supabase **單獨演練**  
- [ ] **RPO／RTO**：數字是否仍成立？責任人／escalation 是否仍有效？  
- [ ] **汰換評估**：單機 compose 是否仍滿足合規／SLA？若否，排 **ADR + 遷移**（見 `LONG_TERM_OPS.md` §7）

---

## 一鍵指令參考（在 `hetzner-phase1-core` 目錄、已載入 `.env` 時）

```bash
docker compose ps
docker system df
./scripts/backup-phase1.sh          # 手動備份
./scripts/verify-backup.sh          # 手動驗證
tail -100 /var/log/lobster-backup.log  # 查看備份日誌
```

### Server rebuild 後重建所有 cron（備份 + 清理 + .env 權限）

```bash
# SG 機器（phase1 stack）
bash scripts/install-maintenance-crons.sh --host sg

# EU 機器（Supabase/Trigger stack）
bash scripts/install-maintenance-crons.sh --host eu
```

此命令會安裝：
- `/etc/cron.d/lobster-backup` — 每日備份 + 驗證
- `/etc/cron.d/docker-weekly-cleanup` — 每週 Docker 清理
- `.env` 權限修正為 600
- 備份目錄建立（mode 700）

### 手動觸發 Docker cleanup（立即執行）

```bash
bash /root/lobster-phase1/scripts/docker-weekly-cleanup.sh
tail -50 /var/log/docker-weekly-cleanup.log
```

### 啟用異地備份（首次設定）

```bash
apt install rclone
rclone config                    # 新增 B2/S3 remote
# 在 .env 加入：RCLONE_REMOTE=remote:bucket/lobster-phase1
# 下次 daily backup 會自動上傳
```

---

## Related

- **全堆疊索引**：`agency-os/docs/operations/hetzner-stack-rollout-index.md`  
- [`LONG_TERM_OPS.md`](./LONG_TERM_OPS.md)  
- [`README.md`](./README.md)
