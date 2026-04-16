# Trigger.dev 自託管（v4，Docker Compose）

**官方文件（版本變動快）**：<https://trigger.dev/docs/self-hosting/docker>  
**上游 compose 正本**：<https://github.com/triggerdotdev/trigger.dev/tree/main/hosting/docker>  

本目錄提供 **與官方 v4 對齊** 的單一 `docker-compose.yml`（webapp + postgres + redis + **ClickHouse** + **registry** + **MinIO** + **Electric** + **supervisor** + **docker-socket-proxy**），並接上 `hetzner-phase1-core` 的 **`lobster-net`** 與 Nginx（`../hetzner-phase1-core/nginx/trigger.conf`）。

**為何你會卡在 `V4_DEPLOY_REGISTRY_HOST` / `CLICKHOUSE_URL`？**  
若 `ghcr.io/.../trigger.dev:latest` 拉到 **v4**，平台會硬性要求 **ClickHouse** 與 **deploy registry**（任務映像 push/pull），且 deploy 時還需要 **artifacts object store bucket**（預設 `packets`）。舊版「只有 postgres + redis + electric + 單一 webapp」的 compose **無法**滿足 v4。  
本 repo 的 **`packages/workflows`** 使用 **`@trigger.dev/sdk` 4.x**，**建議平台維持 v4**；若改回 v3 平台，須同步把 SDK 降到 v3（另開變更，不在此 README 展開）。

---

## 資源與機器規格（重要）

官方建議 **webapp 機 6GB+ RAM**、**worker 機 8GB+ RAM**（見官方 Docker 文件）。  
若你的 VPS **總 RAM 接近 4GB** 或可用記憶體只有約 3.x GB：本 compose 已加 **較緊的 `mem_limit` / ClickHouse override**，仍可能 **OOM 或啟動極慢**——務實解法是 **升級 Hetzner 方案** 或 **把 supervisor（worker）拆到第二台**（官方支援多 worker）。

---

## 誰能做什麼（避免卡住還在等 Cursor）

| 誰 | 能做 |
|----|------|
| **你（或受權工程師）** | Hetzner Console／SSH、`docker compose`、產生 secret、DNS、TLS、`htpasswd`、重啟 nginx |
| **本 repo／AI** | 維護 compose、範本 `.env`、`registry`／`clickhouse` 靜態檔、操作順序；**無法**代你 SSH 進 VPS |

---

## 卡住時：先救 SSH（Console 內執行）

改過 `sshd_config` 後**一定要重啟 sshd**：

```bash
systemctl restart ssh
# 或
service ssh restart
```

（與舊版相同；細節見本檔後半「本機測試」段落。）

---

## 正式啟動順序（SSH 已通）

### 0. 先決條件

- **DNS**：`trigger.aware-wave.com`（或你的網域）指向終止 TLS 的那台機器。  
- **phase1-core 已啟動**：建立 **`lobster-net`**（在 `hetzner-phase1-core/docker-compose.yml` 內 `name: lobster-net`）。  
- **Nginx**：`trigger.conf` 已掛進 nginx 容器；**v4 webapp 對內埠為 `3000`**（本 repo 已把 `proxy_pass` 指到 `http://trigger-webapp:3000`）。  
- **外部 Docker 網路名稱**：若 `docker network ls` 顯示**不是** `lobster-net`，請在 `.env` 設 **`LOBSTER_DOCKER_NETWORK=<實際名稱>`**。

### 1. Registry 帳密（必做，否則 webapp 無法對 registry 驗證）

`registry/auth.htpasswd` 可提交的是**範例**；上線前請在 **`infra/trigger/`** 目錄執行（把密碼改成你自己的）：

```bash
htpasswd -Bbn registry-user 'YOUR_STRONG_PASSWORD' > registry/auth.htpasswd
```

然後在 `.env` 內把 **`DEPLOY_REGISTRY_USERNAME`** / **`DEPLOY_REGISTRY_PASSWORD`** 設成**同一組**帳密。

### 2. 建立 `.env`

```bash
cd ~/Work/lobster-factory/infra/trigger
cp .env.example .env
# 用編輯器依註解填滿；至少 DATABASE_URL / secrets / APP_ORIGIN / ClickHouse / Registry / MinIO
```

### 3. 若曾跑過舊版（v3 單一 webapp 或 `latest` 混用）— 資料庫與 volume

v4 **schema 與舊自架單容器不一定相容**。若 `trigger-webapp` 持續重啟且日誌出現 migration／graphile 相關錯誤，請**備份後**考慮：

```bash
docker compose --env-file .env down
# 備份 volume 或 pg_dump 後，再決定是否刪除舊 volume 重新初始化
docker compose --env-file .env up -d
```

（**刪 volume 會毀資料**；沒把握先做備份。）

### 4. 啟動

```bash
docker compose --env-file .env up -d
docker compose --env-file .env ps
docker compose --env-file .env logs -f webapp
```

### 5. 驗證 dashboard

瀏覽器開 **`https://trigger.aware-wave.com`**（或你的 `APP_ORIGIN`）。  
首次登入若沒設 email provider，**magic link 會印在 webapp log**（官方行為）。

### 6. 本機 deploy 工作流程（`packages/workflows`）

1. 在 dashboard 建立 **project**，把 **`project`** 寫進 `packages/workflows/trigger.config.ts`。  
2. 依官方說明登入自架 instance（`--api-url` / profile）。  
3. **Deploy 機器**必須能 **docker login** 到你的 **registry**（預設只綁 `127.0.0.1:5000` 在 VPS 本機；從筆電 deploy 需 **SSH tunnel** 或改成僅內網可達的安全暴露方式—見官方 *registry setup*）。

```bash
cd lobster-factory/packages/workflows
npx trigger.dev@latest login -a https://trigger.aware-wave.com
npx trigger.dev@latest deploy
```

---

## 常見卡點對照

| 現象 | 處理方向 |
|------|----------|
| 日誌要求 **`CLICKHOUSE_URL`** / **`V4_DEPLOY_REGISTRY_HOST`** | 確認使用**本目錄 v4 compose**；`.env` 內 **`CLICKHOUSE_URL`**、**`DOCKER_REGISTRY_URL`** 有值；`clickhouse` / `registry` 容器已起。 |
| **`DOCKER_RUNNER_NETWORKS`** 相關錯誤 | 本 compose 固定網路名為 **`lf-trg-webapp`**、**`lf-trg-supervisor`**（勿隨意改名，除非同步改 supervisor 環境變數）。 |
| **502 / 連不上** | `docker compose ps` 看 **`trigger-webapp`** 是否 healthy；nginx 是否指到 **`:3000`**；`lobster-net` 是否同一台／名稱正確。 |
| **OOM / 一直被殺** | 升級 RAM 或把 **supervisor** 拆到另一台（官方 worker compose 路徑）。 |

---

## Docker provider → v4 supervisor

v4 不再有獨立 **`provider/docker` + coordinator** 的舊拆法；改為 **supervisor** + **docker-socket-proxy**（見上游 `hosting/docker/worker/docker-compose.yml`，本 repo 已合併進同一檔）。

---

## 本機測試 SSH（Windows PowerShell）

```powershell
ssh -i "$env:USERPROFILE\.ssh\hetzner_trigger" root@<VPS_IP>
```

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `docker-compose.yml` | v4 全 stack（含 ClickHouse、registry、MinIO、supervisor） |
| `.env.example` | 必填變數範本（命名對齊官方） |
| `clickhouse/override.xml` | 限縮 ClickHouse RAM（小 VPS） |
| `registry/auth.htpasswd` | Registry 基本驗證（上線前請重產） |
| `../hetzner-phase1-core/nginx/trigger.conf` | 反代 `trigger-webapp:3000` |
| `../../packages/workflows/trigger.config.ts` | CLI `triggerUrl` / `project` |

**治理入口（agency-os）**：`hetzner-stack-rollout-index.md`、`hetzner-self-host-start-here.md`、`github-actions-trigger-prod-deploy.md`（路徑以 `agency-os/docs/operations/` 為準）。
