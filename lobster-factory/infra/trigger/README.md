# Trigger.dev 自託管（v4，Docker Compose）

> 📍 機器拓樸（誰跑哪台）唯一正本：[`AWAREWAVE_STACK_QUICKREF.md`](../../../agency-os/docs/operations/AWAREWAVE_STACK_QUICKREF.md)。本檔 = Trigger（EU）部署/設定正本；改容器時兩邊一起改。

**官方文件（版本變動快）**：<https://trigger.dev/docs/self-hosting/docker>  
**上游 compose 正本**：<https://github.com/triggerdotdev/trigger.dev/tree/main/hosting/docker>  

本目錄提供 **與官方 v4 對齊** 的單一 `docker-compose.yml`（webapp + postgres + redis + **ClickHouse** + **registry** + **MinIO** + **Electric** + **supervisor** + **docker-socket-proxy**），並接上 `hetzner-phase1-core` 的 **`lobster-net`** 與 Nginx（`../hetzner-phase1-core/nginx/trigger.conf`）。

**地理／機器邊界（與 SG phase1 不混淆）**  
依 **`agency-os/docs/operations/SG_PHASE1_DOCKER_LAYOUT.md`**：**Trigger（含本 compose 內的 `registry:5000`）與 DNS `trigger.*` 屬 EU**；**不在**新加坡 phase1-core 那台。對 SG 查不到 `trigger-*` 容器是**預期**，不代表 Trigger 壞掉。  
Deploy 時 CLI 會把映像 **push 到名為 `registry` 的 host（埠 5000）** — 該名稱只在「EU 上跑著的 Trigger stack」或「你已打通的 tunnel」語意下可解析。

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

- **DNS**：`trigger.aware-wave.com`（或你的網域）指向終止 TLS 的那台機器。**現網**與 **`agency-os/docs/operations/SG_PHASE1_DOCKER_LAYOUT.md`** 對齊：**A 記錄／流量落在 EU `204.168.175.41`**（勿與 SG `5.223.93.113` 混淆）。  
- **External Docker 網路**：compose 依賴 **external `lobster-net`**（可在 **`infra/trigger/.env`** 用 **`LOBSTER_DOCKER_NETWORK`** 改名）。請在 **跑 Trigger stack 的那台機器**上對齊 `docker network ls`。**EU／SG 分離時不必假設 SG phase1-core 已起**網路才會存在——見 **`agency-os/docs/operations/SG_PHASE1_DOCKER_LAYOUT.md`**（進階「跨機共用同名網路」須另案設計，避免此文臆測現場）。  
- **Nginx**：`trigger.conf` 掛在 **對外終止 TLS／反代 Trigger** 的那台（通常與 Trigger webapp 可路由）；**v4 webapp 對內埠為 `3000`**（本 repo 預設 `proxy_pass` → `http://trigger-webapp:3000`）。

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

> `CLICKHOUSE_IMAGE_TAG` 請維持固定版本（預設 `25.7.5-debian-12-r0`），不要用 `latest`，避免新版本移除舊設定鍵導致啟動失敗。  
> **Trigger.dev v4.4.x** 的 ClickHouse Goose 遷移（例如 `003_create_task_runs_v1`）會在 **ReplacingMergeTree** 上使用 **`enable_json_type`**，此設定自 **ClickHouse 25.3** 起才有；若鏡像停在 **24.x**，會出現 `Unknown setting 'enable_json_type'`。請使用本目錄預設的 **`CLICKHOUSE_IMAGE_TAG`（25.7.x）**。  
> **勿**在 **`CLICKHOUSE_URL`** 加上 **`allow_experimental_json_type`**：自 CH 25 起 Trigger webapp 會校驗連線 URL 參數，該鍵會被視為未知而中止啟動（舊版 CH 24 曾需在 URL 加實驗旗標的情況已不再適用）。

### 3. 若曾跑過舊版（v3 單一 webapp 或 `latest` 混用）— 資料庫與 volume

v4 **schema 與舊自架單容器不一定相容**。若 `trigger-webapp` 持續重啟且日誌出現 migration／graphile 相關錯誤，請**備份後**考慮：

```bash
docker compose --env-file .env down
# 備份 volume 或 pg_dump 後，再決定是否刪除舊 volume 重新初始化
docker compose --env-file .env up -d
```

（**刪 volume 會毀資料**；沒把握先做備份。）

### 4. 啟動前先做 ClickHouse config preflight（**必做**，不是建議）

> **為什麼是必做**：ClickHouse **沒有**靜態 config 驗證器 —— 25.7 的 `clickhouse-server --help` 只有 `--config-file`，`--check-config` 不存在。唯一能告訴你設定是好的，是「有一台伺服器用它成功啟動」。2026-08-19 一次 `override.xml` 編輯讓 EU 正式容器進入 crash loop，當時號稱在守這件事的閘（`clickhouse-config-check` 服務）其實從加入的第一天就是空轉的，已於 2026-08-25 移除。

**Windows（PowerShell）一鍵跑**（確認 Docker 引擎已起 → 靜態檢查 → 拋棄式容器實啟驗證）：

```powershell
powershell -ExecutionPolicy Bypass -File .\preflight-clickhouse.ps1
```

若出現 `npipe://.../docker_engine` /「找不到 pipe」：代表 **Docker Desktop 尚未起來**——請先開啟 Docker Desktop，等鯨魚圖示 **Running** 後再執行。

**手動兩段式（macOS／Linux／CI 也可）** — 先跑靜態防回歸檢查（image tag 釘版本、六個已退役產生源仍為 `remove="1"`、merge 記憶體預算存在且非 0、記憶體上限未被調高）：

```powershell
powershell -ExecutionPolicy Bypass -File .\validate-config.ps1
```

再跑行為驗證（會起一個拋棄式 ClickHouse，用候選設定實際開機，然後斷言：每張 system 表都有 TTL、退役產生源沒回來、沒有過寬的表、merge 記憶體預算生效）：

```bash
./clickhouse/validate-override.sh
```

兩者都在 `.github/workflows/trigger-infra-config-guard.yml` 內強制執行。若 preflight 失敗，先修正 `clickhouse/override.xml` 或版本標籤，再進行正式啟動。

### 5. 啟動

```bash
docker compose --env-file .env up -d
docker compose --env-file .env ps
docker compose --env-file .env logs -f webapp
```

### 6. 驗證 dashboard

瀏覽器開 **`https://trigger.aware-wave.com`**（或你的 `APP_ORIGIN`）。  
首次登入若沒設 email provider，**magic link 會印在 webapp log**（官方行為）。

### 7. 本機 deploy 工作流程（`packages/workflows`）

**唯一部署入口（2026-09-23 起）**：repo 根目錄 `powershell -ExecutionPolicy Bypass -File scripts/lobster-trigger-deploy.ps1`；push 到 main 且範圍動到 `packages/workflows` 時，post-push hook（`mcp/claude-userlevel/hooks/post-push-trigger-deploy.ps1`）自動跑同一支。它在 ks-aw-01 上 build，`syncEnvVars` 要的部署期 env 集中在它的步驟 3。新增 `syncEnvVars` 讀取時要同時在步驟 3 的 `$deployBash` export（或列入 `packages/workflows/src/lib/deployEnv/syncEnvVarsParity.test.ts` 的 `NOT_SYNCED_BY_DEPLOY` 並寫明理由）；腳本部署前先跑該測試，紅就中止。同步語意：送出的鍵覆寫既有值、沒送的鍵不動（CLI `deploy.js syncEnvVarsWithServer`，`override: true`）→ 輪替 token 要重跑一次部署；刪鍵要到 dashboard 手動刪。以下 §7／§7a 是 2026-05 EU 時期的手動流程，只作除錯參考：照它的 `--env-file`（只含 PostHog）部署，其他 runtime 變數都不會同步。

**CLI 版本**：與 `packages/workflows/package.json` 內 **`trigger.dev`** devDependency 對齊（目前 **4.4.6**）。請使用 **`npx trigger.dev@4.4.6`**（勿隨意 `@latest`，避免與已鎖 SDK 漂移）。Server（trigger-webapp）目前為 v4.4.4；CLI 4.4.6 對 Server 4.4.4 相容，已確認（2026-05-21）。

1. 在 dashboard 建立 **project**，把 **`project`** 寫進 `packages/workflows/trigger.config.ts`。  
2. **兩種金鑰勿混用**（與 [官方 API keys](https://trigger.dev/docs/apikeys) 一致）：  
   - **Project → API keys → Production secret key（`tr_prod_*`）**：給後端／SDK 設 **`TRIGGER_SECRET_KEY`**，用於 **從你的 App 觸發已部署的 task**。**不要**把它設成 CLI 的 **`TRIGGER_ACCESS_TOKEN`**。  
   - **Account → Personal Access Tokens（`tr_pat_*`）**：在 **`{APP_ORIGIN}/account/tokens`** 建立（例：`https://trigger.aware-wave.com/account/tokens`）。用於 **`login`／`deploy`／CI** 的 **`TRIGGER_ACCESS_TOKEN`**（自架另可設 **`TRIGGER_API_URL`**，見 [CLI deploy](https://trigger.dev/docs/cli-deploy-commands#self-hosting)）。若儀表板只突出 **Secret key** 一欄，請改到 **帳號／Account** 區找 **PAT**。  
3. **互動式登入（一次性）**：`npx trigger.dev@4.4.6 login -a <APP_ORIGIN>`（瀏覽器／magic link；無需在指令列預先貼 `tr_pat_*`）。**CI／無頭機**才需事先匯出 **`TRIGGER_ACCESS_TOKEN`（`tr_pat_*`）**。  
4. **Deploy 機器**必須能對 **`registry:5000`** 完成 **push** — 見下方 **§7a**。

```bash
cd lobster-factory/packages/workflows
npx trigger.dev@4.4.6 login -a https://trigger.aware-wave.com
# 見 §7a；勿用整包 phase1 .env 當 --env-file（會污染 TRIGGER_ACCESS_TOKEN）
npx trigger.dev@4.4.6 deploy -p "<project ref>" -a https://trigger.aware-wave.com --env-file <僅含 POSTHOG_API_KEY、POSTHOG_HOST 的檔案>
```

**Windows 封裝 `deploy-workflows.ps1`**：2026-09-23 退役（只同步 PostHog、走公網被 Cloudflare BFM 擋、依賴已退租的 EU tunnel），現在執行只會報錯並指向上面的唯一入口。

### 7a 完整 deploy：`registry:5000` 為何會失敗／怎麼做才對

自架 v4 會在本機 **build** 後 **push** 到 **`https://registry:5000/...`**（映像倉庫在主機名 **`registry`**）。  
**筆電 Windows** 若未處理 DNS／網路，會出現 **`lookup registry ... no such host`** — 這與 Docker Desktop 是否正常無關。

**路徑 A（首選，最簡運維）**：在 **EU 上跑 Trigger stack 的那台 VPS** SSH 進去，於 repo 內執行上面的 **`npx trigger.dev@4.4.6 deploy`**；並先在該機對 **`127.0.0.1:5000`**（或 compose 公布的 registry 位址）**`docker login`**，帳密與 **`DEPLOY_REGISTRY_USERNAME` / `DEPLOY_REGISTRY_PASSWORD`**（`registry/auth.htpasswd`）一致。

> **EU VPS 一次性前置設定**（已完成，2026-05-07）：registry hostname 只在 Docker 內部 DNS 可解析，從 VPS host 部署需額外三步：
>
> ```bash
> # 1. /etc/hosts — 讓 VPS host 能解析 registry
> echo "127.0.0.1 registry" >> /etc/hosts
>
> # 2. Docker daemon — registry 為純 HTTP（無 TLS），加入 insecure list
> echo '{"insecure-registries":["registry:5000"]}' > /etc/docker/daemon.json
> kill -HUP $(pidof dockerd)   # 熱載入，不重啟容器
>
> # 3. buildkitd config + 重建 trigger buildx builder（host networking + 允許 HTTP registry）
> mkdir -p /etc/buildkit && cat > /etc/buildkit/buildkitd.toml << 'EOF'
> [registry."registry:5000"]
>   http = true
>   insecure = true
> EOF
> docker buildx rm trigger 2>/dev/null || true
> docker buildx create --name trigger --driver docker-container \
>   --driver-opt network=host \
>   --config /etc/buildkit/buildkitd.toml --use
> docker buildx inspect --bootstrap trigger
> ```
>
> 上述設定在 EU VPS 持久化（`/etc/hosts`、`/etc/docker/daemon.json`、`/etc/buildkit/buildkitd.toml`）；**換機或重建 VPS** 時需重做。

> **CLI 認證**：`deploy` 使用的 **`TRIGGER_ACCESS_TOKEN`** 必須是 **`tr_pat_*`（PAT）**，不是 Project 頁的 **`tr_prod_*`**。PAT 請到 **`{APP_ORIGIN}/account/tokens`** 建立。若 vault／本機曾把 **`tr_prod_*` 誤存成變數名 `TRIGGER_ACCESS_TOKEN`**，請改為 **`TRIGGER_SECRET_KEY`**（語意才與 Trigger 文件一致），並另存 PAT 至 **`TRIGGER_ACCESS_TOKEN`**。

**路徑 B（堅持在筆電 build）** 需同時滿足：

1. **SSH tunnel**（背景執行）：把本機 **5000** 轉發到 EU 上 registry 監聽埠（一般等同 EU 上 **`127.0.0.1:5000`**）：
   `ssh -N -L 5000:127.0.0.1:5000 root@<EU_TRIGGER_HOST>`
2. **讓 Docker build 能解析主機名 `registry`**：在 **tunnel 連線期間**，於本機加上 **`127.0.0.1 registry`**（Windows：`C:\Windows\System32\drivers\etc\hosts`，需系統管理員；**deploy 結束後建議移除**，避免與其他專案撞名）。
3. **`docker login registry:5000`**（使用者／密碼同上）。

**長期維運**：映像與 volume 應由 **registry／Trigger 官方升級路徑**與 **備份策略**治理；本 repo 透過 **鎖版 SDK／CLI**、**單一 Owner 文件**、**腳本不重複貼秘條**，降低十年級漂移與誤操作成本 — 「三十年」在工程上等同 **可演進、可審計、可輪替憑證與映像**，而非凍結某一組密鑰。

### PostHog（workflow 事件）

`packages/workflows` 內 `captureWorkflowEvent` 使用 **`posthog-node`**，於任務執行時讀 **`process.env.POSTHOG_API_KEY`** 與 **`POSTHOG_HOST`**（見 `src/observability/posthog.ts`）。這些必須出現在 **Trigger 專案的環境變數**（prod／staging），而不是 phase1-core 的 `.env`。

- **方式 A（儀表板）**：Project → **Environment Variables** → 新增 **`POSTHOG_API_KEY`**（可標為 Secret）、**`POSTHOG_HOST`**（例如 `https://us.i.posthog.com`）。  
- **方式 B（deploy 時同步）**：本 repo 已在 `packages/workflows/trigger.config.ts` 設定 **`syncEnvVars`**。唯一部署入口 `scripts/lobster-trigger-deploy.ps1`（§7）已帶上這兩個變數（key 取自 vault、host 寫在腳本裡），部署即同步（見 [Trigger env docs](https://trigger.dev/docs/deploy-environment-variables)）；不要自己匯出後手跑 `npx trigger.dev deploy`。若兩個變數皆未設定，extension 不會寫入任何 PostHog 鍵。

---

## 常見卡點對照

| 現象 | 處理方向 |
|------|----------|
| 日誌要求 **`CLICKHOUSE_URL`** / **`V4_DEPLOY_REGISTRY_HOST`** | 確認使用**本目錄 v4 compose**；`.env` 內 **`CLICKHOUSE_URL`**、**`DOCKER_REGISTRY_URL`** 有值；`clickhouse` / `registry` 容器已起。 |
| **`DOCKER_RUNNER_NETWORKS`** 相關錯誤 | 本 compose 固定網路名為 **`lf-trg-webapp`**、**`lf-trg-supervisor`**（勿隨意改名，除非同步改 supervisor 環境變數）。 |
| **502 / 連不上** | `docker compose ps` 看 **`trigger-webapp`** 是否 healthy；nginx 是否指到 **`:3000`**；`lobster-net` 是否同一台／名稱正確。 |
| **OOM / 一直被殺** | 升級 RAM 或把 **supervisor** 拆到另一台（官方 worker compose 路徑）。 |
| **Netdata `cgroup_trigger-webapp.mem_usage`** | 整機 RAM 從常態「五十多 %」飆高時，多半是 **webapp 容器 RSS** 逼近 **`mem_limit`**。請將 **`docker-compose.yml` 的 `webapp.mem_limit`／`NODE_MAX_OLD_SPACE_SIZE`** 與 repo 對齊後，於 EU：`cd /root/trigger && git pull && docker compose --env-file .env up -d webapp`。 |
| `/root/supabase/.env: Permission denied` 或 `/root/lobster-phase1/.env: Permission denied` 讀 secret 失敗 | 2026-09-11 起 `/root` 硬化為 `drwx------`；讀取一律加 `sudo`（`lobster-trigger-deploy.ps1` 已於 2026-09-12 修）。 |
| `/root/.nvm/nvm.sh: No such file or directory` | 同一波硬化後 nvm 已移除，node 改走系統 apt 套件（`/usr/bin/node`，經 sudo `secure_path` 可見）；腳本已改成 `[ -s "$NVM_DIR/nvm.sh" ]` 有才 source，沒有就用系統 node。 |
| `trigger deploy` 建置卡在 `#20 pushing manifest` 最後 `401 Unauthorized`（`buildkit` push 到 `registry:5000`） | root 的 `/root/.docker/config.json` 遺失（同一波硬化清掉），登入態沒了。修：`sudo docker login registry:5000 -u <DEPLOY_REGISTRY_USERNAME> -p <DEPLOY_REGISTRY_PASSWORD>`（帳密見該機 `/root/Work/lobster-factory/infra/trigger/.env`）。整套 deploy 也要以 `sudo bash` 執行（不能只是 `ubuntu` 使用者），才能吃到這個登入態＋讀到 `/root/Work`、`/root/.nvm` 等 root-only 路徑。 |

---

## Docker provider → v4 supervisor

v4 不再有獨立 **`provider/docker` + coordinator** 的舊拆法；改為 **supervisor** + **docker-socket-proxy**（見上游 `hosting/docker/worker/docker-compose.yml`，本 repo 已合併進同一檔）。

---

## 本機測試 SSH（Windows PowerShell）

```powershell
ssh -p 58122 -i "$env:USERPROFILE\.ssh\id_ed25519" ubuntu@145.239.195.47   # ks-aw-01; root commands via sudo
```

---

## 相關檔案

| 檔案 | 用途 |
|------|------|
| `deploy-workflows.ps1` | 已退役（2026-09-23）：執行即報錯，指向唯一入口 `scripts/lobster-trigger-deploy.ps1`（見 §7） |
| `docker-compose.yml` | v4 全 stack（含 ClickHouse、registry、MinIO、supervisor） |
| `.env.example` | 必填變數範本（命名對齊官方） |
| `clickhouse/override.xml` | 限縮 ClickHouse RAM（小 VPS） |
| `registry/auth.htpasswd` | Registry 基本驗證（上線前請重產） |
| `../hetzner-phase1-core/nginx/trigger.conf` | 反代 `trigger-webapp:3000` |
| `../../packages/workflows/trigger.config.ts` | CLI `triggerUrl` / `project` |

**治理入口（agency-os）**：`hetzner-stack-rollout-index.md`、`hetzner-self-host-start-here.md`、`github-actions-trigger-prod-deploy.md`（路徑以 `agency-os/docs/operations/` 為準）。
