# cognitive-db

這個資料夾提供每個區域自己的 PostgreSQL 服務檔案。服務名是 `cognitive-db`。資料留在自己的 named volume。資料庫只加入 `lobster-net`，沒有主機埠，因此同一個 Docker 網路上的容器都能以服務名連線。

Every container on the external `lobster-net` can reach this service by name. This folder does not create a dedicated network. A dedicated network is an unapplied hardening step and requires a separate deployment decision.

密碼只從 Docker secret file 讀取。請在套用時讓 `COGNITIVE_DB_PASSWORD_FILE` 指向本機未追蹤的密碼檔。不要把密碼放進 compose、環境檔或版本庫。

## 套用閘

唯一的安裝路徑是 `install-cognitive-db.sh`（不可直接 `docker compose up`；`safe-infra-patch.sh compose` 只管 `/root/lobster-phase1` 的主 compose，管不到這份獨立 compose）。它做的事：預檢（密碼檔存在、權限 600、不在 git 工作樹、網路在、卷不存在）→ 建卷與服務 → 等健康 → 對**空**資料庫跑 migration 到 head（用新的引擎映像）→ 備份一次 → 還原演練一次（一次性容器，核對 `alembic_version`）→ 通知。任一步失敗只拆除這次建立的東西（容器、卷、這次寫的 dump、這次附加的 `COGNITIVE_OS_DATABASE_URLS` 行），已存在的卷一律拒絕、不碰。`--dry-run` 跑真的預檢後印出每個指令、不執行。

套用屬 High-STOP：先有操作者明示 go-ahead。完整順序與每步回滾見 `../../docs/platform/GO_LIVE.md`。

```bash
COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_ENGINE_IMAGE=cognitive-os-api:golive \
  bash Projects/internal/cognitive-engineering-os/ops/cognitive-db/install-cognitive-db.sh --region <第一個區域名> --dry-run
```

Nothing in this folder has been applied.

## 改 PostgreSQL 旗標或記憶體上限（已上線的卷）

`install-cognitive-db.sh` 只管第一次安裝（卷已存在即拒絕）。已上線後改 `max_connections`／`mem_limit` 這類 compose 值：改完檔案，在主機上對**同一個 compose 專案**重建容器；卷不動，資料庫會重啟（約 10 秒，API 這段時間的請求會 5xx，先排在低峰或與 API 部署同一次維護窗口）：

```bash
docker compose -p cognitive-db -f Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml config -q   # 驗 YAML
COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password docker compose -p cognitive-db -f Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml up -d cognitive-db
docker exec cognitive-db-cognitive-db-1 psql -U cognitive -d cognitive_os -Atc "show max_connections"   # 150
```

2026-10-12 起 `max_connections=150`、`mem_limit: 1g`：API 8 個 worker × 連線池 10 = 最多 80 條（1000 人容量測試實測 82 條），其餘留給 migration、備份與維運連線。API 啟動時讀伺服器實際的 `max_connections`，worker × 連線池超過就拒絕啟動（`DB_POOL_EXCEEDS_SERVER`），所以新舊順序都安全：先升 API（80 ≤ 100 − 3）或先升資料庫皆可。

## 備份

主機上的腳本透過 `docker compose ps` 定位私有容器，再以 `docker exec` 執行 PostgreSQL 工具；dump 串流到主機目錄，密碼不離開容器。每個非 template 資料庫各有一份 custom-format dump；檔名中的資料庫名稱是 UTF-8 十六進位，避免不同名稱碰撞。每份新檔案先以 `pg_restore --exit-on-error -f /dev/null` 完整讀取；舊檔案若損壞會先改名為 `.corrupt`，新備份仍會保留，腳本最後才以非零回報。預設保留含當天在內的 7 個 UTC 日期：dump 裡的資料不受抹除影響，被抹除的人最多再留 7 天（`docs/platform/STORAGE_SWITCH.md`「Physical retention decision」，2026-10-10 決定）。部署前 dump（`deploy/lib-db.sh`）用同一個腳本，也是 7 天。

預設目錄是 `/root/backups/cognitive-db`。可用 `COGNITIVE_DB_BACKUP_DIR` 改變目錄。可用 `COGNITIVE_DB_BACKUP_KEEP_DAYS` 改變保留天數。腳本失敗只會回報 `BACKUP FAILED:`，不會回報密碼。

在 `/etc/cron.d/ks-stack-backup` 的既有備份行旁加入一行：

```cron
17 2 * * * root COGNITIVE_DB_PASSWORD_FILE=/root/cognitive-db-password COGNITIVE_DB_BACKUP_DIR=/root/backups/cognitive-db COGNITIVE_DB_BACKUP_KEEP_DAYS=7 /opt/cognitive-os/Projects/internal/cognitive-engineering-os/ops/cognitive-db/backup-cognitive-db.sh >>/var/log/cognitive-db-backup.log 2>&1
```

這行僅供獲核准後使用；路徑是 deploy.sh 用的 `/opt/cognitive-os` 檢出（上線前 `ls` 確認本資料夾在那裡），root 要讀得到 secret file。cron 只寫密碼檔路徑，不寫密碼。

## 部署回滾用的還原

`restore-live-cognitive-db.sh <dump>`（由 `deploy/lib-db.sh` 的 `rollback_all` 在「這次部署已跑過 migration」時呼叫，呼叫前 API 已停）：先把 dump 還原到暫存資料庫並檢查 `alembic_version`，通過才用改名一次換掉 `cognitive_os`；被換下的那個留成 `cognitive_os_failed_<UTC 時間>`（檢查完手動刪）。dump 還原不起來時，正式資料庫完全沒動。

## 上線前清單

- `docker compose -f Projects/internal/cognitive-engineering-os/ops/cognitive-db/docker-compose.cognitive-db.yml exec -T cognitive-db pg_isready -U cognitive -d cognitive_os` 成功。
- 安裝腳本已把這三項做完並留下證據：EMPTY database 上的 migration to head、備份腳本真的跑一次、還原到一次性容器一次。
- 定期用未套用的 `restore-cognitive-db.sh` 把最新 dump 還原到 scratch database；週期由維運排程決定，腳本不會自動套用 compose。
- Run the periodic restore rehearsal with `restore-cognitive-db.sh` into a scratch database; this script is unapplied.
- 確認引擎使用正確的區域資料庫連線，不把 ClaimReview mirror 放進這個資料庫。
- 預估容量目前很小。今天以低於 1 GiB 的引擎資料加上 7 天備份作規劃，正式上線前再用實際 dump 大小校正。

ClaimReview mirror is NOT in this database.
