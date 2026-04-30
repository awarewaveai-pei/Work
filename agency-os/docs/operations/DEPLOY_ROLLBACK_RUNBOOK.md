# 部署與回滾 Runbook（Phase 1 Compose）

**Owner**：本地映像（WordPress／Node API／Next Admin）與外部映像（n8n）的**部署前快照、標準部署、一鍵回滾**操作正本。  
**相關腳本**：`lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh`  
**映像釘選策略**：`lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md` §3  
**資料備份策略**（資料層分開）：`LONG_TERM_OPS.md` §4、`scripts/backup-phase1.sh`  
**Staging 環境**：`docker-compose.staging.yml`、`.env.staging.example`

---

## 快速查表

| 動作 | 指令 |
|:---|:---|
| 部署前快照 | `./scripts/rollback-phase1.sh save <service>` |
| 查可用快照 | `./scripts/rollback-phase1.sh list [service]` |
| 一鍵回滾 | `./scripts/rollback-phase1.sh restore <service> [snapshot-tag]` |
| n8n 版本回滾 | `./scripts/rollback-phase1.sh n8n-pin <old-semver>` |
| 部署後驗收 | `docker compose ps && curl -sf http://127.0.0.1/health && curl -sf http://127.0.0.1/api/health` |

---

## 1. 服務分類

| 服務 | 映像類型 | 回滾方式 |
|:---|:---|:---|
| `node-api` | 本地建置（`lobster-phase1-node-api:local`） | `save` / `restore` |
| `next-admin` | 本地建置（`lobster-phase1-next-admin:local`） | `save` / `restore` |
| `wordpress` | 本地建置（`lobster-phase1-wordpress:local`） | `save` / `restore` |
| `n8n` | 外部映像，版本由 `.env` `N8N_IMAGE_TAG` 控制 | `n8n-pin <old-semver>` |
| `nginx` | `nginx:stable`（upstream tag） | 改 compose image tag → `docker compose pull nginx && up -d nginx` |
| `redis` | `redis:7-alpine`（upstream tag） | 同上 |
| `wordpress-db` | `mariadb:11`（upstream tag） | **大版本升級需 DR drill**；非緊急不輕易回滾 |

---

## 2. 標準部署流程（本地映像）

以 `node-api` + `next-admin` 為例（VPS 上操作）：

```bash
cd lobster-factory/infra/hetzner-phase1-core

# 步驟 1 — 部署前快照（務必執行）
./scripts/rollback-phase1.sh save node-api
./scripts/rollback-phase1.sh save next-admin
# WordPress 有 Dockerfile 更動時也快照
# ./scripts/rollback-phase1.sh save wordpress

# 步驟 2 — 拉最新程式碼
git pull --ff-only origin main

# 步驟 3 — 重建映像
docker compose --env-file .env build node-api next-admin

# 步驟 4 — 滾動更新
docker compose --env-file .env up -d node-api next-admin

# 步驟 5 — 驗收
docker compose ps
curl -sf http://127.0.0.1/api/health
curl -sf http://127.0.0.1/admin/

# 步驟 6 — WORKLOG 留一行（不含密鑰）
# "deployed node-api + next-admin, snapshot saved, health PASS"
```

---

## 3. 回滾流程（本地映像）

```bash
# 確認可用快照
./scripts/rollback-phase1.sh list node-api

# 滾回最新快照（自動取最新）
./scripts/rollback-phase1.sh restore node-api

# 指定特定快照（從 list 輸出複製 tag）
./scripts/rollback-phase1.sh restore node-api rollback-20260430-120000

# 驗收
docker compose ps
curl -sf http://127.0.0.1/api/health
```

WORKLOG 格式：
```
- ROLLBACK: service=node-api | from=rollback-20260430-120000 | reason=<一句話> | health=PASS
```

---

## 4. n8n 版本回滾（外部映像）

```bash
# 查目前版本
grep N8N_IMAGE_TAG .env

# 回到上一個已知穩定版（WORKLOG 有記錄）
./scripts/rollback-phase1.sh n8n-pin 2.17.0

# 驗收
curl -sf http://127.0.0.1/n8n/healthz
```

---

## 5. Staging 環境操作

Staging 使用獨立 Docker Compose project（`-p lobster-staging`），與 prod 完全隔離。

```bash
# 建置 staging 映像（使用 :staging tag，不覆蓋 prod :local）
docker compose -p lobster-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml build

# 啟動 staging
docker compose -p lobster-staging --env-file .env.staging \
  -f docker-compose.yml -f docker-compose.staging.yml up -d

# 驗收（SSH tunnel 或直接在 VPS）
curl -sf http://127.0.0.1:9001/health  # node-api staging
curl -sf http://127.0.0.1:9002/        # next-admin staging
curl -sf http://127.0.0.1:9080/        # nginx staging

# 停止 staging
docker compose -p lobster-staging \
  -f docker-compose.yml -f docker-compose.staging.yml down
```

**Staging 埠號對照**：

| 服務 | 生產埠 | Staging 埠 |
|:---|:---|:---|
| nginx | 80 (system) | 127.0.0.1:9080 |
| node-api | 127.0.0.1:3001 | 127.0.0.1:9001 |
| next-admin | 127.0.0.1:3002 | 127.0.0.1:9002 |
| n8n | 127.0.0.1:5678 | 127.0.0.1:9678 |
| wordpress | 127.0.0.1:8080 | 127.0.0.1:9008 |
| redis | 127.0.0.1:6379 | 127.0.0.1:9379 |
| wordpress-db | — | 127.0.0.1:9306 |

---

## 6. 快照清理（防磁碟堆積）

```bash
# 列出所有快照
./scripts/rollback-phase1.sh list

# 手動刪除舊快照
docker rmi lobster-phase1-node-api:rollback-20260101-000000
```

**建議節奏**：每月清理 30 天前的快照，每服務保留最新 2 個。  
對應 `LONG_TERM_OPS.md` §6 每月維護動作。

---

## 7. 限制與邊界

- **資料庫不在此範圍**：資料回滾需用 `scripts/backup-phase1.sh` 生成的備份還原（見 `LONG_TERM_OPS.md` §4）。
- **快照僅存於本機 VPS Docker daemon**：VPS 毀損時快照不可用，需靠 backup 還原程式碼並重建映像。
- **Nginx / MariaDB / Redis 大版本降級**有風險，須先在 staging 驗證，再排 DR drill。
- 回滾腳本不處理 DB schema migration 的降版——若新版有 DB migration，回滾前需先手動 rollback migration 或還原 DB 備份。

---

## Related Documents (Auto-Synced)

- `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`
- `lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh`
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml`
- `lobster-factory/infra/hetzner-phase1-core/scripts/backup-phase1.sh`
- `agency-os/docs/governance-plans/PLAN_30Y_STABILITY_HARDENING.md`
- `agency-os/docs/operations/hetzner-stack-rollout-index.md`
- `agency-os/TASKS.md`
- `agency-os/WORKLOG.md`

_Last synced: 2026-04-30_
