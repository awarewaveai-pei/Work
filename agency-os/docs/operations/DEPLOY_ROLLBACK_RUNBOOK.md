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
| 清理舊快照 | `./scripts/rollback-phase1.sh clean <service> [days]`（預設 30 天） |
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

> **2026-05-08 起，SG 預設走一鍵腳本 `sg-deploy.sh`**。它把 `git pull → rsync source → build → up -d → health gate → 寫入 `.deployed-commit`` 全包。手動逐步指令僅作為腳本損壞時的 fallback。

### 2.1 一鍵部署（推薦／預設）

```bash
# SSH 到 SG（5.223.93.113，需 hetzner_trigger key）
# 一鍵：拉 git + 同步源碼到 /root/lobster-phase1 + rebuild + healthcheck + 記錄 commit
/root/lobster-phase1/scripts/sg-deploy.sh next-admin

# 多 app 同時：
/root/lobster-phase1/scripts/sg-deploy.sh next-admin node-api wordpress

# 預演：
/root/lobster-phase1/scripts/sg-deploy.sh next-admin --dry-run

# 跳過 git pull（用本機已 fetch 的版本）：
/root/lobster-phase1/scripts/sg-deploy.sh next-admin --skip-pull
```

腳本內部行為（按順序）：

| 步驟 | 動作 | 失敗處置 |
|------|------|---------|
| 1 | `cd /root/Work && git fetch + git pull --ff-only origin main` | 非 fast-forward → 立即 fail（保留現狀，需要人介入） |
| 2 | `rsync -av --delete --exclude='.env*' --exclude='node_modules' --exclude='.next' /root/Work/...//apps/<APP>/ /root/lobster-phase1/apps/<APP>/` | rsync 錯誤 → fail，staging 保持原狀 |
| 3 | `docker compose build <APP>` | build fail → fail，舊 image 還在跑 |
| 4 | `docker compose up -d <APP>` | up fail → fail（容器名衝突時要 `docker compose stop && rm -f` 後重來） |
| 5 | 等 healthcheck 60s | unhealthy → fail（用第 3 節 rollback） |
| 6 | 寫 `/root/lobster-phase1/.deployed-commit`（client-side `check-deploy-drift.ps1` 比對用） | — |

### 2.2 客戶端 drift 檢查

部署完從 client（任何工作機）執行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\check-deploy-drift.ps1
# PASS = 與 origin/main 對齊；WARN = 落後 1+ commit；FAIL = 落後 ≥ 6 commits
```

`system-health-check.ps1` 已自動帶這項（warn-only，不擋 AO-CLOSE）。

### 2.3 手動逐步部署（fallback；當 sg-deploy.sh 損壞時用）

```bash
# 1. 部署前快照
cd /root/lobster-phase1
./scripts/rollback-phase1.sh save next-admin

# 2. 拉最新程式碼到 /root/Work（git source of truth）
cd /root/Work
git pull --ff-only origin main

# 3. 同步源碼到 staging（保留本機 .env*）
rsync -av --delete \
  --exclude='.env*' --exclude='node_modules' --exclude='.next' --exclude='tsconfig.tsbuildinfo' \
  /root/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin/ \
  /root/lobster-phase1/apps/next-admin/

# 4. Build + 部署
cd /root/lobster-phase1
docker compose build next-admin
docker compose up -d next-admin

# 5. 驗收
docker ps --filter name=lobster-next-admin
curl -sf http://127.0.0.1/ -H 'Host: app.aware-wave.com' | grep -c "Build Console"  # 預期 ≥ 1

# 6. WORKLOG 留一行
# "manual deploy next-admin <commit>, health PASS"
```

### 2.4 自動 drift 告警（cron + Slack）

**為什麼不用 Claude Cloud routine**：routine 在 Anthropic 雲跑，沒辦法 SSH 上 SG 而不把 `hetzner_trigger` 私鑰外帶（新增攻擊面，違反 30 年不外流原則）。改在 SG 本地 cron 跑 + 用既有 Slack webhook 通知，零雲端依賴。

| 項目 | 值 |
|------|-----|
| Owner script | `/root/lobster-phase1/scripts/check-drift-and-alert.sh` |
| Cron | `0 1 * * *`（01:00 UTC = 09:00 Asia/Taipei，每日一次） |
| Webhook source | `/root/lobster-phase1/.env` 的 `SLACK_WEBHOOK_URL`（沿用既有 §九 Slack） |
| Telegram fallback（**2026-05-08 加**） | 同檔的 `TELEGRAM_BOT_TOKEN` + `TELEGRAM_ALLOWED_CHAT_IDS` 第一個 ID；同訊息以純文字寄到 Telegram bot DM；獨立於 Slack 成敗，best-effort | 雙通道冗餘 — 出國若 Slack mobile 靜音/漫遊，Telegram 仍會收到 |
| State file | `/root/lobster-phase1/.drift-alert-state`（紀錄 `(deployed, origin) pair`，dedupe 用） |
| Log | `/var/log/sg-deploy-drift.log`（含 `telegram alert sent/FAILED` 欄）|
| Threshold | `BEHIND ≥ 1` 即告警；同一 pair 不會重發（直到 deploy 動了或 origin/main 動了） |
| Manual run | `/root/lobster-phase1/scripts/check-drift-and-alert.sh --force`（測試或重發告警；同時測 Slack + Telegram） |

**訊息格式**：附 `behind` 數字、deployed/origin commit short hash、最近 3 個未上線 commit subject、修法提示（`/sg-deploy`）。

### 2.5 已知行為與 bug 修正紀錄

- **2026-05-08**：sg-deploy.sh 首版把寫 `.deployed-commit` 放在 healthcheck wait 之後，若 `docker compose up -d` 撞容器名 race condition 失敗，drift 偵測會失明。修正：(a) `up -d` 失敗若是 race condition 自動 `stop && rm -f && up -d` 重試一次；(b) 寫 `.deployed-commit` 提前到 build 成功 + up 成功之後（healthcheck 失敗仍保留紀錄，因為 image 已 build、容器已起，drift 角度看部署已落地）。

### 2.6 為什麼有兩個目錄（架構決定）

- `/root/Work/`（git clone）— **源碼單一真相（SSOT）**；隨 `git pull` 自動更新；不直接 build
- `/root/lobster-phase1/`（staging）— 部署艦面；持有本機獨有的 `docker-compose.yml`、`.env`、`nginx/`、`scripts/`；`apps/` 由 `sg-deploy.sh` rsync 自 git
- 中間 rsync `--exclude='.env*'` 確保本機機密永遠不被 git 覆蓋

> 歷史背景：2026-05-07 之前無此 rsync 機制，staging `apps/next-admin/` 自 4/27 凍結 10 天（Build Console、New Client、always-on Command Plane Phase 1 等 19 個 commit、3,785 行更新堆積未上線）。`sg-deploy.sh` 即為此機械化解法。

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
# 一鍵清理 30 天前的快照
./scripts/rollback-phase1.sh clean node-api
./scripts/rollback-phase1.sh clean next-admin
./scripts/rollback-phase1.sh clean wordpress

# 自訂天數（例如保留 14 天內）
./scripts/rollback-phase1.sh clean node-api 14

# 手動刪除單一快照
docker rmi lobster-phase1-node-api:rollback-20260101-000000
```

**建議節奏**：每月執行一次 `clean` 清理 30 天前快照。  
對應 `LONG_TERM_OPS.md` §6 每月維護動作。月曆已在 `MAINTENANCE_CALENDAR.md`。

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
- `lobster-factory/infra/hetzner-phase1-core/SAME_VPS_STAGING_RUNBOOK.md`（同機隔離詳解）
- `agency-os/docs/governance-plans/PLAN_30Y_STABILITY_HARDENING.md`
- `agency-os/docs/operations/hetzner-stack-rollout-index.md`
- `agency-os/TASKS.md`
- `agency-os/WORKLOG.md`

_Last synced: 2026-04-30_
