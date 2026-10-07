# cognitive-db

這個資料夾提供每個區域自己的 PostgreSQL 服務檔案。服務名是 `cognitive-db`。資料留在自己的 named volume。資料庫只加入 `lobster-net`，沒有主機埠，因此只有同一個 Docker 網路上的引擎容器能連線。

密碼只從 Docker secret file 讀取。請在套用時讓 `COGNITIVE_DB_PASSWORD_FILE` 指向本機未追蹤的密碼檔。不要把密碼放進 compose、環境檔或版本庫。

## 套用閘

本卡只有檔案，沒有套用。現有 `lobster-factory/infra/hetzner-phase1-core/scripts/safe-infra-patch.sh compose` 固定在 `/root/lobster-phase1` 對主 compose 執行，不能安全建立這份獨立 compose。上線前須先補獨立 compose 的備份、套用、健康檢查、失敗回滾與通知，再經操作者核准；此處沒有可執行的套用命令。不可直接 `docker compose up`。

Nothing in this folder has been applied.

## 備份

主機上的腳本透過 `docker compose ps` 定位私有容器，再以 `docker exec` 執行 PostgreSQL 工具；dump 串流到主機目錄，密碼不離開容器。每個非 template 資料庫各有一份 custom-format dump；檔名中的資料庫名稱是 UTF-8 十六進位，避免不同名稱碰撞。每份檔案先通過 `pg_restore --list` 和最少一個 archive object 的檢查，才會成為正式檔名。預設保留含當天在內的 14 個 UTC 日期。

預設目錄是 `/root/backups/cognitive-db`。可用 `COGNITIVE_DB_BACKUP_DIR` 改變目錄。可用 `COGNITIVE_DB_BACKUP_KEEP_DAYS` 改變保留天數。腳本失敗只會回報 `BACKUP FAILED:`，不會回報密碼。

在 `/etc/cron.d/ks-stack-backup` 的既有備份行旁加入一行：

```cron
17 2 * * * root COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_BACKUP_DIR=/root/backups/cognitive-db /root/lobster-phase1/Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh >>/var/log/cognitive-db-backup.log 2>&1
```

這行僅供安全套用機制完成、獲核准後使用；部署目錄必須有本資料夾及可讀的 secret file。cron 只寫密碼檔路徑，不寫密碼。

## 上線前清單

- `docker compose -f Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml exec -T cognitive-db pg_isready -U cognitive -d cognitive_os` 成功。
- 在 EMPTY database 上先跑一次真的 migration to head，確認全新資料庫能到最新版本。
- 備份腳本真的跑一次。
- 依照 `restore-cognitive-db.md` 真的還原一次到一次性容器。
- 確認引擎使用正確的區域資料庫連線，不把 ClaimReview mirror 放進這個資料庫。
- 預估容量目前很小。今天以低於 1 GiB 的引擎資料加上 14 天備份作規劃，正式上線前再用實際 dump 大小校正。

ClaimReview mirror is NOT in this database.
