# Stack 備份腳本（repo 版控正本，跑在 ks-aw-01）

> 📍 機器拓樸正本見 [`AWAREWAVE_STACK_QUICKREF.md`](../../../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。
> 完整備份/RAID/還原/遷移策略見 [`runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md`](../../../runbooks/HETZNER-SERVER-MIGRATION-AND-DISASTER-RECOVERY-RUNBOOK.md)。
> **2026-09-24 核實**：這兩支是 ks-aw-01 上 **stack 管線的現役腳本**——`/root/scripts/{backup-eu-stack,verify-backup-eu}.sh` 與本目錄 sha256 相同，由 `/etc/cron.d/ks-stack-backup` 以 `BACKUP_DIR=/root/backups-stack` 執行（02:30／03:00 UTC）。`lobster-factory/infra/ks-aw-01-backup/` 是另一條（soulful）管線，不是取代品。舊 EU 主機已於 2026-08-30 退租；檔名的 `eu` 是歷史。

本目錄為 **repo 版控正本**；實機在 ks-aw-01 `/root/scripts/`。

| 檔案 | 作用 |
|------|------|
| `backup-eu-stack.sh` | 每日 02:30 UTC（cron `/etc/cron.d/ks-stack-backup`）：dump Supabase PG（含 `n8n`/`postiz` DB）+ Trigger PG + MainWP DB + Uptime Kuma/n8n/storage/minio/postiz/mainwp-files volume + **`.env` ×4 加密** → 本機 `/root/backups-stack/` → 異地 Cloudflare R2（`lobster-backup/eu/<date>/`）→ 保留 7 天。舊 SG rsync 異地腿已於 2026-08-28 移除。 |
| `verify-backup-eu.sh` | 驗當日備份 integrity（gzip/tar -t + 關鍵檔存在 + 異地存在）。 |

## 部署到 ks-aw-01（無 auto-deploy，手動；ubuntu + sudo）

```bash
scp -P 58122 -i ~/.ssh/id_ed25519 lobster-factory/infra/eu-backup/backup-eu-stack.sh lobster-factory/infra/eu-backup/verify-backup-eu.sh ubuntu@145.239.195.47:/tmp/
ssh -p 58122 -i ~/.ssh/id_ed25519 ubuntu@145.239.195.47 'sudo install -m 0755 /tmp/backup-eu-stack.sh /tmp/verify-backup-eu.sh /root/scripts/ && sudo bash -n /root/scripts/backup-eu-stack.sh && rm -f /tmp/backup-eu-stack.sh /tmp/verify-backup-eu.sh'
```
部署後比對：`sudo sha256sum /root/scripts/backup-eu-stack.sh` = repo。

## 密鑰（`.env` 加密）

`BACKUP_ENC_KEY` 在 ks-aw-01 `/etc/default/eu-backup`（**不進備份**）+ 鏡像於本機 vault（`secrets-vault.ps1 -Action get -Name BACKUP_ENC_KEY` 僅確認存在，輸出為遮罩；還原時的真值取自本機 `mcp\user-env.ps1`）。
還原 `env.tar.gz.enc`：`openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -in env.tar.gz.enc | tar xzf - -C /`。

## 異地狀態

**現況（2026-09-24）**：本機 `/root/backups-stack/` + **Cloudflare R2**（SG rsync 腿已隨退租移除）。歷史（2026-06-26）：本機 + SG rsync + **Cloudflare R2**（已修 — 原 `R2_API_TOKEN` 未 export 給子腳本，`set -a` 包住 source 修復，實測 10/10 檔 HTTP 200）。
- 單一異地（R2）：第二個異地（R2 二 bucket / Storage Box）尚未建立。

_SG/Phase1 的備份正本在 [`hetzner-phase1-core/LONG_TERM_OPS.md`](../hetzner-phase1-core/LONG_TERM_OPS.md)（兩台互為異地）。_
