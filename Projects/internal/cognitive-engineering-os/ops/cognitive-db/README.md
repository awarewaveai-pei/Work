# cognitive-db

這個資料夾提供每個區域自己的 PostgreSQL 服務檔案。服務名是 `cognitive-db`。資料留在自己的 named volume。資料庫只加入 `lobster-net`，沒有主機埠，因此只有同一個 Docker 網路上的引擎容器能連線。

密碼只從 Docker secret file 讀取。請在套用時讓 `COGNITIVE_DB_PASSWORD_FILE` 指向本機未追蹤的密碼檔。不要把密碼放進 compose、環境檔或版本庫。

## 套用

這些命令只供操作者在核准後使用。本卡沒有執行它們。

```bash
export COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password
test -s "$COGNITIVE_DB_PASSWORD_FILE"
sudo scripts/safe-infra-patch.sh compose Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml cognitive-db
```

`safe-infra-patch.sh` 會在正式機器上做備份、檢查和健康檢查。不要用 `docker compose up` 取代它。

Nothing in this folder has been applied.

## 備份

腳本會查出叢集中所有非 template 資料庫，逐一建立 PostgreSQL custom-format dump。每個檔案先通過 `pg_restore --list` 和最少一個 archive object 的檢查，才會成為正式檔名。預設保留 14 天。

預設目錄是 `/root/backups/cognitive-db`。可用 `COGNITIVE_DB_BACKUP_DIR` 改變目錄。可用 `COGNITIVE_DB_BACKUP_KEEP_DAYS` 改變保留天數。腳本失敗只會回報 `BACKUP FAILED:`，不會回報密碼。

在 `/etc/cron.d/ks-stack-backup` 的既有備份行旁加入一行：

```cron
17 2 * * * root COGNITIVE_DB_BACKUP_DIR=/root/backups/cognitive-db /root/lobster-phase1/Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh >>/var/log/cognitive-db-backup.log 2>&1
```

部署目錄必須讓這條命令能讀到本資料夾。不要把密碼放在 cron 行。

## 上線前清單

- `docker exec cognitive-db pg_isready -U cognitive -d cognitive_os` 成功。
- 在 EMPTY database 上先跑一次真的 migration to head，確認全新資料庫能到最新版本。
- 備份腳本真的跑一次。
- 依照 `restore-cognitive-db.md` 真的還原一次到一次性容器。
- 確認引擎使用正確的區域資料庫連線，不把 ClaimReview mirror 放進這個資料庫。
- 預估容量目前很小。今天以低於 1 GiB 的引擎資料加上 14 天備份作規劃，正式上線前再用實際 dump 大小校正。

ClaimReview mirror is NOT in this database.
