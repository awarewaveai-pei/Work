# EU Stack 備份腳本（repo 版控正本）

> 📍 機器拓樸正本見 [`AWAREWAVE_STACK_QUICKREF.md`](../../../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。
> 完整備份/RAID/還原/遷移策略見 [`runbooks/EU-STACK-BACKUP-RAID-RESTORE-FOR-DEDICATED-RUNBOOK.md`](../../../runbooks/EU-STACK-BACKUP-RAID-RESTORE-FOR-DEDICATED-RUNBOOK.md)。

EU VPS（`204.168.175.41`）每日備份的兩個腳本。本目錄為 **repo 版控正本**；實機部署在 EU `/root/scripts/`。

| 檔案 | 作用 |
|------|------|
| `backup-eu-stack.sh` | 每日 02:30 UTC（cron `/etc/cron.d/eu-backup`）：dump Supabase PG（含 `n8n`/`postiz` DB）+ Trigger PG + MainWP DB + Uptime Kuma/n8n/storage/minio/postiz/mainwp-files volume + **`.env` ×4 加密** → 本機 `/root/backups/` → 異地 rsync(SG) + Cloudflare R2 → 保留 7 天。 |
| `verify-backup-eu.sh` | 驗當日備份 integrity（gzip/tar -t + 關鍵檔存在 + 異地存在）。 |

## 部署到 EU（無 auto-deploy，手動 scp）

```bash
scp -i ~/.ssh/hetzner_trigger lobster-factory/infra/eu-backup/backup-eu-stack.sh root@204.168.175.41:/root/scripts/backup-eu-stack.sh
scp -i ~/.ssh/hetzner_trigger lobster-factory/infra/eu-backup/verify-backup-eu.sh root@204.168.175.41:/root/scripts/verify-backup-eu.sh
ssh -i ~/.ssh/hetzner_trigger root@204.168.175.41 'chmod +x /root/scripts/{backup-eu-stack,verify-backup-eu}.sh; bash -n /root/scripts/backup-eu-stack.sh'
```

## 密鑰（`.env` 加密）

`BACKUP_ENC_KEY` 在 EU `/etc/default/eu-backup`（**不進備份**）+ 鏡像於本機 vault（`secrets-vault.ps1 -Action get -Name BACKUP_ENC_KEY`）。
還原 `env.tar.gz.enc`：`openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENC_KEY -in env.tar.gz.enc | tar xzf - -C /`。

## 異地狀態

**真 3-2-1 成立**（2026-06-26）：本機 `/root/backups/` + SG rsync + **Cloudflare R2**（已修 — 原 `R2_API_TOKEN` 未 export 給子腳本，`set -a` 包住 source 修復，實測 10/10 檔 HTTP 200）。
- 待辦：SG 退役時把異地 L1（rsync→SG）改為 R2 二 bucket / Storage Box（R2 主線已可靠）。

_SG/Phase1 的備份正本在 [`hetzner-phase1-core/LONG_TERM_OPS.md`](../hetzner-phase1-core/LONG_TERM_OPS.md)（兩台互為異地）。_
