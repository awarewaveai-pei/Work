# 同機 Staging 隔離 Runbook（Phase 1 Hetzner VPS）

**Owner**：本檔說明如何在 **單一 Hetzner VPS** 上同時運行 **Production** 與 **Staging**，互不干擾。  
**適用範圍**：`lobster-phase1` Docker Compose 堆疊（Nginx / Redis / n8n / WordPress / Node API / Next Admin）。  
**操作正本**：所有 staging 指令均從 VPS 上 `/root/lobster-phase1/` 執行。  
**回滾操作**：`agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`

---

## 1. 說明

### 為什麼需要同機 Staging？

Phase 1 使用單一 Hetzner VPS。在沒有第二台機器的情況下，仍需在部署上線前驗證：

- 新版映像是否能正常啟動
- 環境變數是否配置正確
- API / 健康檢查是否通過
- 前端 Admin 介面是否可存取

**同機 Staging** 讓你在同一台 VPS 上用隔離的容器名稱、獨立的 port 範圍（9xxx）和獨立的 volumes，跑一套平行的 staging 環境，驗收後再切換 prod。

### 三層隔離機制

| 層次 | 方式 | 說明 |
|:---|:---|:---|
| **Project 名稱** | `-p lobster-staging` | volumes、networks 獨立命名；不與 `lobster-phase1` 共用 |
| **Container 名稱** | `docker-compose.staging.yml` 覆寫 `container_name` | staging 容器名稱加 `staging-` 前綴，避免與 prod 衝突 |
| **Host Port** | `docker-compose.yml` 全 port 使用 env-var | `.env.staging` 設定 9xxx；prod 使用 default（現行值） |
| **Image Tag** | `.staging` tag 獨立 | `docker tag :local :staging`；重建 staging 不覆蓋 prod |

---

## 2. VPS 目錄結構（必讀）

VPS 上有 **兩個相關目錄**，角色不同：

```
/root/lobster-phase1/          ← 本番生產目錄（compose project: lobster-phase1）
  docker-compose.yml             ← 主 compose（prod & staging 共用，port 已 env-var 化）
  docker-compose.staging.yml     ← staging overlay（container_name + image 覆寫）
  docker-compose.observability.yml  ← 觀測堆疊
  .env                           ← 生產密鑰（永不 commit）
  .env.staging                   ← Staging 密鑰（永不 commit；每機手建）
  .env.staging.example           ← 範本（有版本控制）
  scripts/
    rollback-phase1.sh           ← 回滾腳本
    backup-phase1.sh             ← 備份腳本

/root/Work/lobster-factory/infra/hetzner-phase1-core/   ← git repo（開發同步用）
  docker-compose.yml             ← 與上方同步（git 正本）
  docker-compose.staging.yml     ← 與上方同步（git 正本）
  scripts/rollback-phase1.sh     ← git 正本
```

> **重要**：`docker compose` 指令必須在 **`/root/lobster-phase1/`** 下執行，不是 git repo 目錄。  
> git repo 是開發同步用；VPS 上的 production compose project 位於 `/root/lobster-phase1/`。

---

## 3. Staging Port 對照表

| 服務 | Prod Port | Staging Port | 環境變數 |
|:---|:---|:---|:---|
| nginx | `80` (all interfaces) | `127.0.0.1:9080` | `NGINX_HOST_PORT` |
| node-api | `127.0.0.1:3001` | `127.0.0.1:9001` | `NODE_API_HOST_PORT` |
| next-admin | `127.0.0.1:3002` | `127.0.0.1:9002` | `NEXT_ADMIN_HOST_PORT` |
| n8n | `127.0.0.1:5678` | `127.0.0.1:9678` | `N8N_HOST_PORT` |
| wordpress | `127.0.0.1:8080` | `127.0.0.1:9008` | `WORDPRESS_HOST_PORT` |
| redis | `127.0.0.1:6379` | `127.0.0.1:9379` | `REDIS_HOST_PORT` |
| wordpress-db | （不對外） | `127.0.0.1:9306` | 在 staging overlay 設定 |

---

## 4. 操作步驟

### 4.1 初次準備（只做一次）

```bash
cd /root/lobster-phase1

# 從範本建立 staging env（填入真實值後存為 .env.staging）
cp .env.staging.example .env.staging
# 必改項目：
#   WORDPRESS_DB_NAME=wordpress_staging   ← 避免與 prod DB 衝突
#   WORDPRESS_DB_USER=wpuser_staging
#   WORDPRESS_DB_PASSWORD=<staging-only 密碼>
#   WORDPRESS_DB_ROOT_PASSWORD=<staging-only 密碼>
# 末段的 NGINX_HOST_PORT / NODE_API_HOST_PORT 等 9xxx 設定
# 保持不變（範本已填好）
```

### 4.2 建置 Staging 映像

```bash
cd /root/lobster-phase1

# 方式 A — 從 prod :local tag（快速，適合只驗環境）
docker tag lobster-phase1-node-api:local    lobster-phase1-node-api:staging
docker tag lobster-phase1-next-admin:local  lobster-phase1-next-admin:staging
docker tag lobster-phase1-wordpress:local   lobster-phase1-wordpress:staging

# 方式 B — 獨立重建（完整驗證新版本；不影響 prod :local）
docker compose -p lobster-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml build
```

### 4.3 啟動 Staging

```bash
cd /root/lobster-phase1

docker compose -p lobster-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml up -d --no-build
```

### 4.4 驗收

```bash
# node-api staging（DoD 最低要求）
curl -sf http://127.0.0.1:9001/health

# next-admin staging（DoD 最低要求）
curl -sf http://127.0.0.1:9002/ -o /dev/null -w "HTTP %{http_code}"

# 全服務狀態
docker compose -p lobster-staging \
  -f docker-compose.yml -f docker-compose.staging.yml ps

# 遠端瀏覽（本機 SSH tunnel）
ssh -L 9001:127.0.0.1:9001 -L 9002:127.0.0.1:9002 <vps-host>
# 瀏覽器開 http://localhost:9001/health 與 http://localhost:9002/
```

### 4.5 確認 Prod 未受影響

```bash
# Prod 健康檢查
curl -sf http://127.0.0.1/api/health
docker ps --filter name=lobster-node-api --filter name=lobster-next-admin \
  --format "table {{.Names}}\t{{.Status}}" | grep -v staging
```

### 4.6 停止 Staging

```bash
cd /root/lobster-phase1

docker compose -p lobster-staging \
  -f docker-compose.yml -f docker-compose.staging.yml down
```

> **注意**：`down` 預設不刪除 volumes（`lobster-staging_*_data`）。  
> 若要完全清除 staging 資料，加 `-v`：`docker compose ... down -v`

---

## 5. 注意事項

### 5.1 資料隔離

| 項目 | 狀態 | 說明 |
|:---|:---|:---|
| Volumes | ✅ 隔離 | `-p lobster-staging` 使 volume 名稱加專案前綴 |
| Networks | ✅ 隔離 | 同上；staging 容器不在 `lobster-net` 上 |
| WordPress DB | ✅ 隔離 | `.env.staging` 使用 `wordpress_staging` 資料庫名 |
| Redis | ✅ 隔離 | staging Redis 為獨立容器（`lobster-staging-redis`） |
| Supabase | ⚠️ 共用 | 若 `.env.staging` 指向同一 Supabase URL，資料不隔離；建議申請獨立 staging project |

### 5.2 Port 競合防護

`docker-compose.yml` 所有 host port 已使用 env-var 模板（`${NODE_API_HOST_PORT:-127.0.0.1:3001}` 等）。Docker Compose 合併 override 時會 **疊加** ports 而非取代，因此若不透過 env-var 切換，staging 容器會同時嘗試綁定 prod port 與 staging port，造成 `port is already allocated` 錯誤。

**正確做法**：始終透過 `--env-file .env.staging` 帶入 9xxx port 設定。

### 5.3 `.env.staging` 安全

- **永不 commit** `.env.staging`（`.gitignore` 已排除 `.env.*`）
- 範本 `.env.staging.example` 有版本控制，可安全 commit
- Staging DB 密碼應與 prod **不同**，避免操作失誤波及 prod DB

### 5.4 同機資源限制

Staging 啟動後 RAM 使用量增加約 500MB–1GB（取決於 n8n 與 WordPress）。若 VPS 記憶體 < 4GB，建議：
- 僅啟動需要驗收的服務（`--no-deps` + 個別服務名稱）
- 或在驗收完畢後立即 `down`

### 5.5 Image 標籤管理

`:staging` tag 只是 `:local` 的別名（指向同一 image digest）。

```
prod   lobster-phase1-node-api:local     ← 正在跑的版本
staging lobster-phase1-node-api:staging  ← 同一 digest 或獨立建置
```

若使用方式 B 獨立重建，`:staging` 會指向新 digest，`:local` 不受影響。

---

## 6. Observability 整合

Staging 服務目前 **不接入** Loki/Promtail（Observability stack 收集 prod nginx 與 syslog）。若要讓 staging 也送 log：

1. 在 `docker-compose.staging.yml` 為 `node-api` / `next-admin` 加 logging driver 或 Promtail label
2. 或在 Grafana `http://127.0.0.1:3009` Explore，手動指定 staging container log 路徑

> Grafana 位於 `http://127.0.0.1:3009`（prod VPS 本機存取，或 SSH tunnel port-forward）。

---

## 7. 關聯性

| 檔案 | 角色 | 說明 |
|:---|:---|:---|
| `docker-compose.yml` | **Port env-var 正本** | 全 host port 使用 `${*_HOST_PORT:-...}`；prod 不設定時走 default |
| `docker-compose.staging.yml` | **Staging overlay** | 覆寫 `container_name`（`lobster-staging-*`）與 `image`（`:staging` tag） |
| `.env.staging.example` | **Staging env 範本** | 含全部必要 key，末段有完整 port override 區塊 |
| `.env.staging` | **Staging 密鑰**（不入庫） | 從範本複製後填入真實值；各機器各自維護 |
| `scripts/rollback-phase1.sh` | **回滾腳本** | `save` / `restore` / `list` / `clean` / `n8n-pin`；在 prod 與 staging 均適用 |
| `LONG_TERM_OPS.md` | **長期營運契約** | §1 staging 欄位、§3 映像釘選策略 |
| `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md` | **部署與回滾正本** | 標準部署流程、回滾流程、Staging §5 |

---

## 8. 相關事項

### Rollback 演練（Task 1 DoD）

在 Staging 上線後，Rollback 演練流程不變，在 **prod** context 執行：

```bash
cd /root/lobster-phase1
./scripts/rollback-phase1.sh save node-api
# ... 部署新版 ...
./scripts/rollback-phase1.sh restore node-api
curl -sf http://127.0.0.1/api/health
```

Rollback 僅影響 `:local` tag；`:staging` tag 不受影響。

### 與 git repo 同步

VPS 上的 `/root/lobster-phase1/docker-compose.yml` 與 `/root/Work/lobster-factory/infra/hetzner-phase1-core/docker-compose.yml` 應保持一致。若在 git repo 更新後需同步到 VPS prod 目錄：

```bash
# 在 VPS 上，從 git repo 複製更新後的 compose 檔
cp /root/Work/lobster-factory/infra/hetzner-phase1-core/docker-compose.yml \
   /root/lobster-phase1/docker-compose.yml
cp /root/Work/lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml \
   /root/lobster-phase1/docker-compose.staging.yml
# 重啟生效
docker compose --env-file .env up -d --no-build
```

### 快速狀態查表

```bash
# Prod 所有服務狀態
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -v staging

# Staging 所有服務狀態
docker compose -p lobster-staging \
  -f /root/lobster-phase1/docker-compose.yml \
  -f /root/lobster-phase1/docker-compose.staging.yml ps

# Observability
docker ps --filter name=lobster-loki --filter name=lobster-promtail \
  --filter name=lobster-grafana --format "table {{.Names}}\t{{.Status}}"
```

---

## Related Documents (Auto-Synced)

- `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml`
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml`
- `lobster-factory/infra/hetzner-phase1-core/.env.staging.example`
- `lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh`
- `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`
- `agency-os/docs/operations/DEPLOY_ROLLBACK_RUNBOOK.md`

_Last synced: 2026-04-30_
