# 部署與回滾 Runbook（Phase 1 Compose）

**Owner**：本地映像（WordPress／Node API／Next Admin／HCI-30 App，2026-09-18 起）與外部映像（n8n）的**部署前快照、標準部署、一鍵回滾**操作正本。  
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
| 部署後驗收 | `docker compose ps && curl -sf http://127.0.0.1:3002/login && curl -sf http://127.0.0.1:3002/api/ops/summary && curl -sfk --resolve aware-wave.com:443:127.0.0.1 https://aware-wave.com/ && curl -sf http://127.0.0.1:3001/health` |

> **⚠️ Supabase-Auth cutover（2026-06-05）後**：next-admin 首頁 `/` 與所有 `/ops/*` 已被 middleware gate，未帶 session 的 `curl http://127.0.0.1:3002/` 會回 **302→/login**（健康但非 2xx）。故 `sg-deploy.sh` Step 7 smoke 與本驗收指令已改探測 **`/login`**（公開頁，回 200）+ `/api/ops/summary`（豁免端點）作為 liveness。完整登入流驗證需帶 Supabase session cookie（見 §auth-smoke）。
>
> **⚠️ `ks-aw-01` 整併後訂正（2026-08-29）**：wordpress／node-api 這兩探針原本寫「confirmed reachable 2026-05-21」，是舊單租戶 SG 機器的行為——2026-08-28 SG+EU 整併到 `ks-aw-01` 後該機同時掛 mainwp/n8n/postiz/oracle/soulfulexpression/sg-stack 等多個 vhost，裸 `curl http://127.0.0.1/`（無 Host header）不再落到 WordPress，會打中 nginx 預設 vhost 回 404；`api.aware-wave.com` 這邊 node-api 真正的健康路徑是 `/health`（不是 `/api/health`，該 vhost 不剝前綴）。**這個 stale 探針造成每一次 next-admin 部署都被這兩個無關端點的假陽性觸發自動 rollback**（2026-08-29 portal.aware-wave.com 部署時發現：next-admin 自己的兩個探針都過，是這兩個才炸）。`sg-deploy.sh` Step 7 與本表指令已同步訂正。**wordpress 探針走過兩輪修正**：第一輪改用裸 curl 帶 Host + `-L` 跟隨 WordPress 強制的 http→https 轉址，但 critic 覆審抓到 `-L` 會讓 curl 重新查公開 DNS、可能落到 Cloudflare edge——等於健康探針繞出機器之外，若本機 nginx→WordPress 這條路徑真的死了，Cloudflare 快取或別的節點仍可能回 200，讓這個「防自動 rollback 誤判」的閘門本身出現同一類假陽性。**第二輪改用 `--resolve <host>:443:127.0.0.1`**（`lobster-factory/infra/soulful/cutover-sync.sh:234` 既有慣例）強制在本機解析，探測真正的 vhost+TLS 路徑但不離開這台機器；改探 apex `aware-wave.com`（非 `www.`）避免多一層 www→apex 轉址。
>
> **⚠️ node-api 探針第三輪訂正（2026-09-12）**：前段訂正把 node-api 探針改成 `curl -H "Host: api.aware-wave.com" http://127.0.0.1/health`，這打的是**外層 host-nginx（Certbot 管理，監聽 80）**，不是實際跑 next-admin/node-api 的 docker 容器層——跟同日 `safe-infra-patch.sh` 那個 nginx smoke check 踩到的是同一種「打錯層」bug（commit `5a1ec19e1` 有完整根因記錄）。8/29 訂正當下這條探針還能過，是因為那時 Certbot 還沒對 `api.aware-wave.com` 加轉址規則；9/12 稍早一次 cognitive-os 部署觸發 Certbot 幫另一個網域(`cognitive.aware-wave.com`)申請憑證，副作用是外層也開始強制 `api.aware-wave.com` 轉 https，原本能過的探針變成 301 假陽性，誤觸發一次健康的 next-admin 部署自動 rollback（未造成資料遺失，rollback 機制本身正確運作，只是判斷依據錯了）。**訂正**：node-api 跟 next-admin 一樣有自己直接發布的容器埠（`docker-compose.yml` `PORT: "3001"`，本表 §容器對照也早就寫著 `node-api | 127.0.0.1:3001`），改探 `http://127.0.0.1:3001/health`——完全繞過任何一層 nginx，nginx 有沒有轉址跟 node-api 自己活著與否無關。

---

## 1. 服務分類

| 服務 | 映像類型 | 回滾方式 |
|:---|:---|:---|
| `node-api` | 本地建置（`lobster-phase1-node-api:local`） | `save` / `restore` |
| `next-admin` | 本地建置（`lobster-phase1-next-admin:local`） | `save` / `restore` |
| `wordpress` | 本地建置（`lobster-phase1-wordpress:local`） | `save` / `restore` |
| `hci-app`（2026-09-18 起）| 本地建置（`hci30-app:local`，source root `Projects/internal/hci30/` 整棵，非 `apps/` 底下） | `save` / `restore`。同一 commit 也加了 `hci-postgres`/`hci-fetch-runner`/`hci-object-storage`（見 `docker-compose.yml`；原本的 `hci-network-guard` sidecar 已於 2026-09-21 移除，egress 規則改由 `hci-fetch-runner` 自己的 entrypoint 每次啟動時套用，見 ADR-0029 Amendment 2026-09-21）——這三個是基礎設施服務，透過 `safe-infra-patch.sh compose` 套用，不隨 `hci-app` 的程式碼部署重建，此表的 `save`/`restore` 只涵蓋 `hci-app` 本身 |
| `renderer`（2026-09-21 起）| 本地建置（`lobster-phase1-renderer:local`，source `apps/renderer/`） | `save` / `restore`，已入 `IMAGE_MAP` 與 sg-deploy `RESTORABLE_APPS`。**首次上線不經 sg-deploy**：先手動 `docker build`、再 `safe-infra-patch.sh compose … renderer` 套 compose（首次沒有前一版可 restore，保底是 safe-infra-patch 的 compose 備份）。移除：`docker compose stop renderer && docker compose rm -f renderer`，再用 safe-infra-patch 拿掉 compose 的 `renderer` service、`renderer-net` 與 next-admin 的 `renderer-net`／`RENDERER_SHARED_SECRET` 兩行——next-admin 沒有這個 secret 時渲染後備層自動停用（`extract-provider` match()=0），蒐集退回純 HTTP 階。smoke 會做一次**真實 render**（example.com），因為 `/healthz` 只證明 node 活著、證明不了 Chromium 在降權後能啟動；2026-09-23 起再加一次**真實 `/snapshot`**（example.com 必須 `"failureCode":null`，site-watch 用的另一條程式路徑：資源全載、全頁 JPEG、自己的 deadline），失敗同樣計入 `_smoke_errors` → 自動 rollback |
| `n8n` | 外部映像，版本由 `.env` `N8N_IMAGE_TAG` 控制 | `n8n-pin <old-semver>` |
| `nginx` | `nginx:stable`（upstream tag） | 改 compose image tag → `docker compose pull nginx && up -d nginx` |
| `redis` | `redis:7-alpine`（upstream tag） | 同上 |
| `wordpress-db` | `mariadb:11`（upstream tag） | **大版本升級需 DR drill**；非緊急不輕易回滾 |
| `mainwp-web` (EU) | `wordpress:6.7-apache`（upstream tag） | `/root/mainwp/scripts/migrate-to-vps.sh backup` → 改 compose image tag → `docker compose up -d` → restore DB/files。Owner doc: `docs/wordpress_mainwp_plan.md` §25.4 |
| `mainwp-db` (EU) | `mysql:8.0`（upstream tag） | mysqldump 備份優先；大版本升級需 DR drill |

---

## 1.5 Deploy hold（2026-09-23 新增；部署前必看）

`lobster-factory/infra/hetzner-phase1-core/DEPLOY_HOLD` 存在於 `main` = **所有 app 部署一律拒絕**，包含手動跑 `sg-deploy.sh`。用途：未完成的工作已經進 `main`（交接中、等 migration、等 env），此時「落後 N commit」是**刻意的**，不是待修。

| 面向 | 位置 |
|---|---|
| 強制 | `sg-deploy.sh` 步驟 1.85（讀 `origin/main:DEPLOY_HOLD`，refuse 並印 `reason=`） |
| 自動路徑 | `auto-deploy-next-admin.sh`（cron `0 3,7,11,15,19,23` UTC）有 hold 就跳過，**不發 Slack／Telegram**；`check-drift-and-alert.sh`（cron `0 1` UTC 每日 drift 提醒）同樣靜音 — 否則兩支都在叫人部署 hold 正要擋的東西 |
| 腳本新鮮度 | 上面兩支 cron 腳本決策前先跑 `sync-host-scripts.sh`（主機 `scripts/` = `origin/main`），自身被換掉就 re-exec 新版 → 改它們的邏輯下一個 tick 就生效。2026-09-23 07:00Z 的「auto-deploy FAILED」誤報就是舊版 caller（無 hold 檢查）先決策造成 |
| 浮出 | `check-smoke-tests.ps1` 的 `deploy_hold` → AO-RESUME §1 每次開工都看得到；> 14 天升 `warn:hold_stale_<N>d` |
| 也會提醒 | `check-deploy-drift.ps1`／`/check-drift`／AO-CLOSE 的 deploy hint：有 hold 時改印「不要跑 sg-deploy」 |

- **設 hold**：新增該檔，`reason=` 單行 ASCII（會進 ssh 捕捉的 log，CJK 會在 zh-TW PowerShell 端變亂碼）、`created_utc=`（ISO 8601，stale 判斷用），commit + push。
- **解除**：`git rm` 該檔 + push；下一個 cron tick 自動正常部署。
- **單次繞過**（不解除 hold）：`DEPLOY_HOLD_OVERRIDE=1 bash /root/lobster-phase1/scripts/sg-deploy.sh <app>`。只在操作者明示時用。
- hold **不會**隱藏 drift：drift 數字照報，只是把「快去部署」換成「這是故意的」。

## 2. 標準部署流程（本地映像）

> **2026-05-08 起，SG 預設走一鍵腳本 `sg-deploy.sh`**。它把 `git pull → rsync source → build → up -d → health gate → 寫入 `.deployed-commit`` 全包。手動逐步指令僅作為腳本損壞時的 fallback。

### 2.1 一鍵部署（推薦／預設）

```bash
# SSH 到 ks-aw-01（`ssh -i ~/.ssh/id_ed25519 -p 58122 ubuntu@145.239.195.47`；前任與舊 SG/EU 均已退場）
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
| 1.8 | `sync-host-scripts.sh`：`origin/main` 的 `scripts/` 裝進 `/root/lobster-phase1/scripts`（全部 `.sh` 過 `bash -n` 才裝、rename 替換、部署進行中不換）；`sg-deploy.sh` 自己變了就 re-exec 新版 | 任一 `.sh` 語法錯 → 一個都不裝、deploy fail（急用：手動 `git pull` 後 `--skip-pull`） |
| 1.85 | `DEPLOY_HOLD` 在 `origin/main` → 拒絕（§1.5） | fail；auto-deploy 在呼叫前就先靜默跳過 |
| 1.5 | `npm test`（next-admin 專屬 test gate，35 vitest tests） | test 失敗 → 立即 fail abort deploy，舊版繼續跑 |
| 2 | `rsync -av --delete --exclude='.env*' --exclude='node_modules' --exclude='.next' /root/Work/.../apps/<APP>/ /root/lobster-phase1/apps/<APP>/` | rsync 錯誤 → fail，staging 保持原狀 |
| 2.5 | 對每個 RESTORABLE app 執行 `rollback-phase1.sh save`：快照**正在跑的 container 的 image**（沒有 container 才用 `:local`；兩者都沒有＝首次部署，印 `Saved: NONE`），並記下本次 tag（2026-09-19 起） | 腳本不可執行或 save 失敗 → 在 build 前 fail，**不在沒有回滾點的情況下部署** |
| 3 | `docker compose build <APP>` | build fail → fail，舊 image 還在跑 |
| 4 | `docker compose up -d <APP>`（race-condition 自動重試一次） | up fail → fail（容器名衝突時自動 stop/rm-f/up 重試；兩次皆失敗才 abort） |
| 5 | 寫 `/root/lobster-phase1/.deployed-commit` + `.deployed-at`（drift 偵測用） | — |
| 6 | 等 healthcheck 60s | unhealthy／逾時 → **自動 rollback**（與 Step 7 共用 `do_rollback`，2026-09-19 起；之前只 fail，壞 container 會留在 prod） |
| 7 | **HTTP smoke check + 自動 rollback**（curl 端點見 sg-deploy.sh Step 7）；**致命**：任一 endpoint 非 2xx → `do_rollback` 以 `rollback-phase1.sh restore <app> <本次 Step 2.5 的 tag>` 逐一還原 RESTORABLE_APPS（wordpress/node-api/next-admin/hci-app/renderer；不是「最新的 rollback-*」；restore 後 health 失敗算 ROLLBACK_FAILED）+ 寫 `.rollback-triggered` flag + `.deployed-commit` 還原為 PREVIOUS_COMMIT + `fail`（exit non-zero）。**Drill mode**：`AUTO_REPAIR_ROLLBACK_ON_SMOKE_FAIL=false ./sg-deploy.sh <app>` 保留舊「非致命 warn」行為供刻意降級演練。2026-05-23 Tier 3 audit C1 fix：實現 Plan v3.2 §五 第 3 層承諾的自動 rollback | 失敗 → SMOKE_WARN log + `.smoke-warn` + ROLLBACK fail + `.rollback-triggered`；`auto-deploy-next-admin.sh` 同時讀兩個 flag 在 Slack/Telegram 附加 SMOKE_WARN 與「🔴 AUTO-ROLLBACK FIRED」prefix |

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

### 2.5 Endpoint Alert 部署後驗收

SG 的 `awarewave-endpoint-alert.service` 不應打 public Cloudflare URL 檢查 SG 自己，避免每日 `000000` hairpin timeout。部署或重建後確認 drop-in：

```bash
grep -E '^(CHECK_URLS|CHECK_URLS_SLOW)=' /etc/default/awarewave-endpoint-alert.local
```

預期：

```bash
CHECK_URLS="http://127.0.0.1:8080/ http://127.0.0.1:3002/api/ops/summary http://127.0.0.1:3001/health"
CHECK_URLS_SLOW="https://uptime.aware-wave.com/api/entry-page"
```

手動驗收：

```bash
systemctl start awarewave-endpoint-alert.service
systemctl status awarewave-endpoint-alert.service --no-pager -l
cat /var/lib/awarewave-alert/last_state
cat /var/lib/awarewave-alert/fail_streak
```

預期：service `SUCCESS`、`last_state=ok`、`fail_streak=0`。

### 2.5 已知行為與 bug 修正紀錄

- **2026-05-08**：sg-deploy.sh 首版把寫 `.deployed-commit` 放在 healthcheck wait 之後，若 `docker compose up -d` 撞容器名 race condition 失敗，drift 偵測會失明。修正：(a) `up -d` 失敗若是 race condition 自動 `stop && rm -f && up -d` 重試一次；(b) 寫 `.deployed-commit` 提前到 build 成功 + up 成功之後（healthcheck 失敗仍保留紀錄，因為 image 已 build、容器已起，drift 角度看部署已落地）。

### 2.6 為什麼有兩個目錄（架構決定）

- `/root/Work/`（git clone）— **源碼單一真相（SSOT）**；隨 `git pull` 自動更新；不直接 build
- `/root/lobster-phase1/`（staging）— 部署艦面；持有本機獨有的 `docker-compose.yml`、`.env`、`nginx/`；`scripts/` 由 `sync-host-scripts.sh` 從 `origin/main` 同步（cron 決策前 + `sg-deploy.sh` 1.8；**手改會被覆蓋**）；`apps/` 由 `sg-deploy.sh` rsync 自 git
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

## 7. Trigger.dev Workflows 部署與回滾（EU VPS）

**Owner script**：`scripts/lobster-trigger-deploy.ps1`（本機執行，SSH 到 EU VPS）  
**部署方式**：CLI deploy（不影響 Docker containers，Worker image 由 Trigger.dev 自管）  
**Server**：`https://trigger.aware-wave.com`（= ks-aw-01 `145.239.195.47`；前任與舊 EU VPS 均已退場）

### 7.1 標準部署

```powershell
# 本機執行（自動從 vault 讀取 PAT + Supabase key）
.\scripts\lobster-trigger-deploy.ps1
```

腳本行為：vault 讀秘 → SSH EU VPS → `git pull --ff-only origin main` → `npm install` → `./node_modules/.bin/trigger deploy`

### 7.2 回滾（Deploy 失敗或功能回退）

Trigger.dev 自架無內建 rollback 指令。回滾方式：**重新 deploy 上一個穩定 commit 的 package.json**。

```powershell
# 1. 本機 checkout 舊版本的 package.json 與 lock file（不 reset 整個 working tree）
git checkout <prev-stable-commit> -- lobster-factory/packages/workflows/package.json
git checkout <prev-stable-commit> -- lobster-factory/packages/workflows/package-lock.json

# 2. 本機重跑 npm install 確認 lock file 一致
cd lobster-factory/packages/workflows && npm install

# 3. 重新 deploy（腳本會 git pull，但 VPS 上仍是 HEAD；此時手動 deploy 而非透過腳本）
# SSH 進 EU VPS：
#   cd /root/Work/lobster-factory/packages/workflows
#   git checkout <prev-stable-commit> -- package.json package-lock.json
#   npm install
#   export TRIGGER_ACCESS_TOKEN=<tr_pat_*>
#   export TRIGGER_API_URL=https://trigger.aware-wave.com
#   npx trigger.dev@<prev-version> deploy
```

> **注意**：回滾後，Workers 上的舊版本 image 會立即生效（新 run 用舊 image）。進行中的 run 繼續在舊 worker 跑直到完成。

WORKLOG 格式：
```
- TRIGGER_ROLLBACK: from=<bad-commit> to=<good-commit> | reason=<一句話> | health=PASS
```

### 7.3 版本追蹤

| 項目 | 位置 |
|------|------|
| CLI 版本（以 package.json 為準） | `packages/workflows/package.json` → `devDependencies.trigger.dev` |
| Server 版本（EU VPS） | `docker inspect trigger-webapp \| jq '.[].Config.Image'`（SSH EU VPS） |
| 最後 deploy 版本 | Trigger.dev Dashboard → Deployments |
| CLI↔Server 相容矩陣 | CLI 4.x 對 Server 4.x patch 版本均相容；跨 minor 需查 changelog |

---

## 8. 限制與邊界

- **資料庫不在此範圍**：資料回滾需用 `scripts/backup-phase1.sh` 生成的備份還原（見 `LONG_TERM_OPS.md` §4）。
- **快照僅存於本機 VPS Docker daemon**：VPS 毀損時快照不可用，需靠 backup 還原程式碼並重建映像。
- **Nginx / MariaDB / Redis 大版本降級**有風險，須先在 staging 驗證，再排 DR drill。
- 回滾腳本不處理 DB schema migration 的降版——若新版有 DB migration，回滾前需先手動 rollback migration 或還原 DB 備份。

---

## 9. 出國免 SSH 部署：self-hosted GitHub Actions runner（手機觸發）

**目的**：出國/漫遊時，不靠 SSH（VPS port 22 常被網路政策擋）、不把密鑰外帶，仍能用手機 GitHub app 一鍵部署。  
**Owner workflow**：`.github/workflows/sg-deploy.yml`（`workflow_dispatch` 手動觸發）  
**部署引擎**：沿用既有 `/root/lobster-phase1/scripts/sg-deploy.sh`（**零改寫**；tsc→npm test→build→healthcheck→smoke→auto-rollback 全包，見本檔 §2.1）

### 9.1 架構決定（為什麼是 self-hosted runner）

| 方案 | 密鑰是否外帶 | 是否對公網開 22 | 結論 |
|:---|:---|:---|:---|
| GHA 雲端 runner SSH 進 VPS | ❌ `hetzner_trigger` 私鑰要進 GitHub Secrets | ❌ 要開 | **否決**（違反 §2.4「30 年不外流」原則） |
| **self-hosted runner 住 VPS** | ✅ 零外帶（runner 在本機跑 sg-deploy.sh） | ✅ 不用（runner 走 outbound 443 拉任務） | **採用** |
| Telegram bot `/deploy` | ✅ | ✅ | 備援（command plane，另案） |

> 同 §2.4 既有原則：「沒辦法 SSH 上 SG 而不把私鑰外帶（新增攻擊面）→ 改在 SG 本地跑」。self-hosted runner 是同一原則的延伸：執行體本身就在 VPS 上。

### 9.2 安全前提（強制，裝前先確認）

- **僅限 private repo**：`awarewaveai-pei/work` 為 private。**絕不可**把 self-hosted runner 接到 public repo（forked PR 可在你機器上執行任意程式）。
- **僅 write 權限者可觸發**：`workflow_dispatch` 預設只有對 repo 有 write 權限的帳號能按 Run。
- **merge 不會部署**：workflow 無 `push` 觸發；唯一觸發是人手點 Run（保留 High-risk prod deploy 的「自己按下去」紀律）。
- **input 白名單**：workflow 內建 app allowlist（`next-admin node-api wordpress`，與 `sg-deploy.sh` RESTORABLE_APPS 同步）+ 用 env 傳值避免 `${{ }}` shell injection。

> **⚠️ 主要殘留風險（critic 2026-06-12 標記，務必理解）**：self-hosted runner 會執行 `main` 上 `sg-deploy.yml` 的 `run:` 區塊。因此：
> 1. **write 權限 ≈ SG VPS 的 root RCE**。任何能 push 到 `main` 的帳號可改寫 workflow 的 `run:` → 以 runner 身分執行任意程式碼。**`docker` group 等同 root**（可 `docker run -v /:/host`），故「非 root 但在 docker group」並非真正降權。
> 2. **補償控制（二選一以上，強烈建議都做）**：
>    - **GitHub Environment 審核閘**：repo Settings → Environments → `production-sg` → **Required reviewers** 設你自己/第二人。workflow 已掛 `environment: production-sg`，設好後每次 deploy 需按核准（即使是 `workflow_dispatch`）。
>    - **main 分支保護**：開 branch protection（require PR review），讓「改 workflow → root RCE」這條路徑必經 review。
>    - **最小權限 runner**：跑專屬低權使用者，透過**單一指令、無 args wildcard** 的 `sudoers` rule 呼叫 `sg-deploy.sh`，而非直接給 runner docker-group/root。
> 3. **collaborator 授權即 prod-deploy 授權**：新增任何 write collaborator = 給予 prod 部署（root）能力，需據此審核。

### 9.3 一次性安裝（在 SG VPS 上跑，約 10 分鐘）

> 第一次裝 runner 仍需 SSH 一次（用 Termius 或在家用桌機）。裝好之後出國就免 SSH。

```bash
# --- 在 SG VPS（5.223.93.113）上，建議用專屬非 root 使用者，但需在 docker group ---
# 1. 確認部署使用者能跑 docker（sg-deploy.sh 要 docker compose 權限）
id                                   # 確認在 docker group；否則：sudo usermod -aG docker $USER && 重新登入
test -x /root/lobster-phase1/scripts/sg-deploy.sh && echo "deploy script OK"

# 2. 下載 runner（版本 + SHA256 以 GitHub 設定頁顯示的為準）
mkdir -p ~/actions-runner && cd ~/actions-runner
RUNNER_VER="2.319.1"   # 以 repo Settings → Actions → Runners → New self-hosted runner 顯示為準
curl -o actions-runner.tar.gz -L \
  "https://github.com/actions/runner/releases/download/v${RUNNER_VER}/actions-runner-linux-x64-${RUNNER_VER}.tar.gz"
# 驗 checksum（防供應鏈竄改；<SHA> 複製自 GitHub 設定頁的安裝指令）
echo "<SHA256_FROM_GITHUB_PAGE>  actions-runner.tar.gz" | shasum -a 256 -c
tar xzf actions-runner.tar.gz

# 3. 註冊（TOKEN 從 repo Settings → Actions → Runners → New self-hosted runner 複製，短效）
#    labels 必須含 self-hosted,sg（workflow 的 runs-on 比對這兩個 label）
./config.sh \
  --url https://github.com/awarewaveai-pei/work \
  --token <REGISTRATION_TOKEN> \
  --name sg-vps \
  --labels self-hosted,sg \
  --unattended --replace

# 4. 裝成 systemd 服務（開機自啟、掛了自動重啟）
sudo ./svc.sh install
sudo ./svc.sh start
sudo ./svc.sh status        # 預期 active (running)
```

> **注意**：runner 進程要跑得起 `docker compose`（sg-deploy.sh 依賴）。若用非 root，務必在 `docker` group；root 則直接可用，但 §9.2 的 private-repo 前提更要嚴守。

### 9.4 出國部署操作（手機）

1. 手機 GitHub app（或瀏覽器）→ repo → **Actions** 分頁
2. 選 **SG Deploy (self-hosted runner)** → **Run workflow**
3. 填 `apps`（預設 `next-admin`；多個用空白分隔）/ 視需要勾 `dry_run`
4. 看 job 紅/綠：
   - **綠** = 部署成功且 smoke 通過
   - **紅** = 任一 gate 失敗（tsc/test/build/smoke）；smoke 失敗時 sg-deploy.sh 已**自動 rollback** 到前一快照（見 §2.1 Step 7、§3）
5. 想先驗證不真的部署 → 勾 `dry_run`（只 rsync -n，不 rebuild）

### 9.5 健康檢查與故障

| 症狀 | 處置 |
|:---|:---|
| Actions 點 Run 但卡 *Queued* 不動 | runner 離線。需 SSH 進 VPS：`cd ~/actions-runner && sudo ./svc.sh status`；停了 → `sudo ./svc.sh start`。**runner 自己離線時無法用 workflow 救**（雞生蛋）→ 用 Termius/Hetzner console |
| job 紅在 "runner not found" | runner label 不含 `sg` 或未註冊；重跑 §9.3 step 3（`--labels self-hosted,sg`） |
| job 紅在 sg-deploy gate | 照 log 修（tsc/test 失敗看 §2.1）；smoke 失敗已自動 rollback，舊版仍在跑 |
| 機器整台 OOM/卡死 | runner 也躺了 → Termius SSH 或 Hetzner Cloud app 主控台（見 `runbooks/HETZNER-SERVER-502-OOM-EMERGENCY-PLAYBOOK.md`） |

> **邊界**：self-hosted runner 只解「部署」。機器本身生病（OOM、docker daemon 掛、磁碟滿、要 reboot）runner 救不了，仍需 Termius / Hetzner console。出國前務必備好這兩個逃生門。

### 9.6 移除 runner（汰換/重裝）

```bash
cd ~/actions-runner
sudo ./svc.sh stop && sudo ./svc.sh uninstall
./config.sh remove --token <REMOVAL_TOKEN>   # token 同從 Settings → Runners 取得
```

> **驗證**：移除後到 repo Settings → Actions → Runners 確認 `sg-vps` 已消失。若殘留「registered 但 dead」的 runner，workflow 仍會把 job 派給它而卡死 → 在該頁手動 Force remove。

---

## Related Documents (Auto-Synced)

- `.github/workflows/sg-deploy.yml`
- `lobster-factory/infra/hetzner-phase1-core/LONG_TERM_OPS.md`
- `lobster-factory/infra/hetzner-phase1-core/scripts/rollback-phase1.sh`
- `lobster-factory/infra/hetzner-phase1-core/docker-compose.staging.yml`
- `lobster-factory/infra/hetzner-phase1-core/scripts/backup-phase1.sh`
- `lobster-factory/infra/hetzner-phase1-core/SAME_VPS_STAGING_RUNBOOK.md`（同機隔離詳解）
- `agency-os/docs/governance-plans/PLAN_30Y_STABILITY_HARDENING.md`
- `agency-os/docs/operations/hetzner-stack-rollout-index.md`
- `agency-os/TASKS.md`
- `agency-os/WORKLOG.md`

_Last synced: 2026-05-21_
