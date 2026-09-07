# Phase 1B — Renderer staging rehearsal runbook

**狀態：執行前 runbook；未在主機建立 staging stack，未部署、未重啟正式服務。**
**日期：2026-09-06**
**適用主機：** `ks-aw-01` / `145.239.195.47:58122` / `ubuntu`（以 `sudo` 操作）

## 目的與界線

本 runbook 只用於在正式 renderer 之外建立受控、可撤回的 renderer staging canary，以驗證 Phase 1A authentication 和後續 Phase 1B durable-job 工作。不建立或執行 `video_jobs` migration，不變更 `app.aware-wave.com`，不發佈影片，不接 WordPress/Postiz。

正式現況是 `lobster-video-service`、`lobster-remotion-service` 均健康且僅綁定 loopback，但 renderer compose 位於未納版控的 `/root/render-services/docker-compose.yml`。正式主機上 `/root/lobster-phase1/docker-compose.staging.yml` 曾經確認不存在；完整證據見 `LIVE_DEPLOYMENT_BASELINE_AND_STAGING_GAP.md:7-33`。因此 `SAME_VPS_STAGING_RUNBOOK.md` 的一般應用 stack 指令不構成 renderer deployment 授權。

受版本控制的 renderer canary manifest 已在隔離 branch：

- `D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\docker-compose.renderer-staging.yml:1-74`
- `D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\.env.renderer-staging.example:1-10`

它只開 `127.0.0.1:9732`／`9733`、使用 `lobster-renderer-staging-net`、`restart: "no"` 與 staging-only credentials。不得把 production `video.env`、`remotion.env`、R2 token、API key 或 render token 複製進 staging env。

## 不變量

1. staging 容器、network、port、image tag、R2 bucket、render token 和 provider credentials 必須與 production 分離。
2. staging 不加入 `lobster-net`，不綁定 8732／8733／公開埠，不使用 production R2 bucket 或 production token。
3. 在任何 `docker compose up` 前，記錄 production container ID、image digest、health 與 port binding；若它們在 rehearsal 後變動即停止並依 rollback 回報。
4. staging health、未授權拒絕、正確 token 認證、最大 scene／asset limits 和一次 disposable render 都要有 evidence；renderer 成功不等於可部署或可發布。
5. 所有 host 寫入、build、container start/stop 都是 High-risk 執行點，必須先有 staging-only secrets、備份參考、具體 rollout package 與當次明示 go-ahead。

## Gate 0 — 唯讀 preflight

由具主機權限的操作者執行下列命令；預期只輸出狀態或 `absent`，不改動任何檔案：

```bash
ssh -p 58122 -o BatchMode=yes ubuntu@145.239.195.47 \
  'hostname; sudo docker ps --format "{{.Names}} {{.Image}} {{.Status}} {{.Ports}}"'

ssh -p 58122 -o BatchMode=yes ubuntu@145.239.195.47 \
  'sudo test -f /root/lobster-phase1/docker-compose.renderer-staging.yml && echo present || echo absent'

ssh -p 58122 -o BatchMode=yes ubuntu@145.239.195.47 \
  'sudo test -f /root/render-services/docker-compose.yml && echo production_renderer_compose_present || echo production_renderer_compose_absent'
```

預期：hostname 為 `ns31414856`；正式 renderer 維持 healthy；staging manifest 在尚未佈建時為 `absent`。若主機、port binding、production renderer 名稱或 health 與基線不同，停止，不建立 staging，先更新 `LIVE_DEPLOYMENT_BASELINE_AND_STAGING_GAP.md`。

## Gate 1 — staging package review

在隔離 branch 上執行：

```powershell
Set-Location 'D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core'
docker compose --env-file .env.renderer-staging.example -f docker-compose.renderer-staging.yml config
```

預期：Compose config 可解析且只含 `lobster-staging-video-service`、`lobster-staging-remotion-service`、9732、9733 與 `lobster-renderer-staging-net`。若 `config` 顯示 production port、`lobster-net`、production bucket 或空 token placeholder，停止並修正版本控制 manifest，不能在主機手改真相。

## Gate 2 — staging-only secret and storage proof

此 gate 不在聊天、Git、compose command line、shell history 或 log 顯示實際值。操作者建立 root-only staging env，且至少證明：

| 項目 | 必須符合 |
|---|---|
| `RENDER_AUTH_TOKEN` | 新生成、只限 staging、不得等於 production token。 |
| R2 account/token/bucket | staging-only identity；bucket 不得是正式 media bucket。 |
| Claude/Pexels/OpenAI | 最小權限、獨立額度／可撤銷；未使用者保持空。 |
| 檔案權限 | root owner、`0600`；只允許 compose service 讀取。 |
| 記錄 | 只保存 secret reference、建立時間、owner 與 rotation due；不保存值。 |

在沒有上述 evidence 前，禁止 `build` 或 `up`。

## Gate 3 — canary build and isolated start

此 gate 是 High-risk 操作，只有具體批准後才可執行。操作位置必須是主機上受控、已由部署 package 安裝的 renderer staging manifest 目錄；不得以 `scp`、直接 `git pull` 或覆寫 `/root/render-services` 達成。

```bash
cd /root/lobster-phase1
sudo docker compose -p lobster-renderer-staging \
  --env-file .env.renderer-staging \
  -f docker-compose.renderer-staging.yml config

sudo docker compose -p lobster-renderer-staging \
  --env-file .env.renderer-staging \
  -f docker-compose.renderer-staging.yml build

sudo docker compose -p lobster-renderer-staging \
  --env-file .env.renderer-staging \
  -f docker-compose.renderer-staging.yml up -d
```

預期：只新增 `lobster-staging-*` containers；production container IDs 不變；staging 僅開 127.0.0.1:9732/9733。任何 production container restart、8732/8733 collision、network attachment 或 credential mismatch 都是 failure，立即進 Gate 5。

## Gate 4 — acceptance evidence

由主機內 loopback 執行，不將 token 印到終端：

```bash
curl -fsS http://127.0.0.1:9732/health
curl -fsS http://127.0.0.1:9733/health
sudo docker inspect lobster-staging-video-service lobster-staging-remotion-service \
  --format '{{.Name}} {{.State.Health.Status}} {{range .NetworkSettings.Networks}}{{.NetworkID}}{{end}}'
sudo docker ps --filter name=lobster- --format '{{.Names}} {{.Status}} {{.Ports}}'
```

驗收記錄至少包含：兩個 health response、staging image digest、container ID、network name、production pre/post container ID、未帶 token 的 `401/403`、帶 staging token 的授權成功、一次最大兩場景 disposable render、輸出 R2 object key、job ID、錯誤分類與 cleanup evidence。所有 request 使用 staging-only素材與 tenant；不得上傳正式客戶資料。

## Gate 5 — rollback and evidence retention

staging failure 的第一處置只停止 staging project；不 restart production：

```bash
cd /root/lobster-phase1
sudo docker compose -p lobster-renderer-staging \
  --env-file .env.renderer-staging \
  -f docker-compose.renderer-staging.yml down
```

預期：只移除 `lobster-renderer-staging` containers/network；不帶 `-v`，保留 staging evidence volume 直到審查完成。接著再跑 Gate 0 的 production health / container ID 比對。若正式服務有任何變動，停止後續動作，依正式 deploy rollback runbook 處理並建立事故紀錄。

## Completion record

rehearsal 完成後，更新 `LIVE_DEPLOYMENT_BASELINE_AND_STAGING_GAP.md` 與 `WORKLOG.md`，保存：manifest commit、image digest、staging env reference（非值）、健康證據、認證正負向結果、canary job/output、production pre/post comparison、rollback result 與未解風險。只有此 record 完整後，才可提出 Phase 1A production rollout 或 Phase 1B migration rehearsal package。
