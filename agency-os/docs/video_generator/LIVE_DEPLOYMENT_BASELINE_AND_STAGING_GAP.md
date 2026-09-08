# 正式影片部署基線與 staging 缺口

**日期：2026-09-06**
**方式：** 使用 ubuntu@145.239.195.47:58122、嚴格主機金鑰、唯讀 Docker 盤點。未讀取或輸出任何密鑰值。

## 已驗證的正式狀態

| 項目 | 結果 | 證據 |
|---|---|---|
| 正式主機 | PASS | hostname 是 ns31414856；使用者確認的主機角色是 ks-aw-01。 |
| VideoStudio | PASS | lobster-next-admin healthy，2026-09-05T20:04:03Z 起動。 |
| Quick Engine | PASS | lobster-video-service healthy；容器埠 8732 的 GET /health 回應 native format、dimension、OpenAI TTS capabilities。 |
| Remotion | PASS | lobster-remotion-service healthy；容器埠 8733 的 GET /health 回應 HTTP 200 與 version 1.0.0。 |
| Renderer 網路邊界 | PASS | 8732、8733 都只綁定 127.0.0.1；服務在 lobster-net。 |
| 既有 token 一致性 | PASS | 以主機內比較方式驗證 Next-admin VIDEO_SERVICE_SECRET 分別等於兩個 renderer 的 RENDER_AUTH_TOKEN；未輸出 token 或雜湊。 |
| Phase 1A 程式部署 | NOT DEPLOYED | renderer 容器未找到 auth_policy.py / src/auth-policy.ts；正式 image 建立於 2026-08-31，現行容器起動於 2026-09-05。 |

## 重要部署漂移

正式 renderer 的實際 compose 位於 /root/render-services/docker-compose.yml，環境檔是 root-only 的 video.env 和 remotion.env；這個目錄不是 Git repository。它的 compose 最後修改於 2026-08-28。

相對地，版本庫的 renderer compose 位於：

- D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\video-service\docker-compose.video.yml:1
- D:\Work\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service\docker-compose.remotion.yml:1

因此部署前不能假定「Git 內 compose = 線上 compose」。必須先建立受版本控制的 renderer deployment manifest 與同步驗證，並比對 image digest、容器 ports、network、healthcheck、restart policy 與非機密環境變數名稱。

## staging 缺口

主機的 /root/lobster-phase1/docker-compose.staging.yml 不存在，與
D:\Work\lobster-factory\infra\hetzner-phase1-core\SAME_VPS_STAGING_RUNBOOK.md:1-14
所述路徑不一致。故目前沒有可供 Phase 1A 使用的受控 staging stack。

在 staging 存在前，禁止：

1. 重啟正式 renderer 或 next-admin 來測試認證。
2. 改動正式 video.env 或 remotion.env。
3. 部署 Phase 1A image。
4. 執行 video_jobs schema migration。

## 已完成的 staging 交付

已在隔離分支提交 9667d0075：

- D:\\Work\\lobster-factory\\infra\\hetzner-phase1-core\\docker-compose.renderer-staging.yml:1
- D:\\Work\\lobster-factory\\infra\\hetzner-phase1-core\\.env.renderer-staging.example:1

它使用 staging image、127.0.0.1:9732/9733、lobster-renderer-staging-net、healthcheck、CPU/RAM 限制，且不加入 lobster-net。Docker Compose config validation 已通過。
該 commit 已在 `main`；這是版本庫交付證據，不代表檔案已部署到主機。

## 部署前剩餘條件

1. 在主機建立 root-only 的 .env.renderer-staging，填入 staging-only R2、Claude、Pexels 與 render token；範本不可填 production 值。
2. 以 staging compose build/up，確認兩個 healthcheck、未帶 token 的拒絕、正確 token 的接受與 production containers 未重啟。
3. 記錄 staging image digest、測試 job ID 和 rollback down 結果。
4. 經此驗收後，才可建立 Phase 1A 的 production rollout package。

## Gate 0 receipt — 2026-09-08

唯讀 SSH 預檢完成；未讀 secrets、未寫主機、未啟動或停止容器。

| Check | Actual result | Next action |
|---|---|---|
| Host | `ns31414856` | PASS: correct `ks-aw-01`. |
| Production renderers | `lobster-video-service` and `lobster-remotion-service` are healthy; loopback `127.0.0.1:8732/8733`. | Preserve; no restart or direct change. |
| Production compose | `/root/render-services/docker-compose.yml` present. | Drift boundary remains. |
| Controlled staging manifest on host | `/root/lobster-phase1/docker-compose.renderer-staging.yml` absent. | BLOCK host-side Gates 2–4 and all staging build/start actions; do not migrate `video_jobs`. Local Gate 1 parse is separate. |
| Durable executor baseline | Trigger services are healthy. | Availability alone is not a video-task deployment proof. |

Evidence command: `ssh -p 58122 -o BatchMode=yes -o ConnectTimeout=12 ubuntu@145.239.195.47 'hostname; sudo docker ps ...; sudo test -f ...'`; exit `0`. Full non-secret result is recorded in `agency-os/WORKLOG.md` dated 2026-09-08.

## Gate 1 receipt — 2026-09-08

本機版本庫 manifest 解析通過：`docker compose --env-file D:\Work\lobster-factory\infra\hetzner-phase1-core\.env.renderer-staging.example -f D:\Work\lobster-factory\infra\hetzner-phase1-core\docker-compose.renderer-staging.yml config --quiet`，exit `0`。這只驗證 YAML／變數結構；未 build、未 up、未連主機，不能取代 Gate 2 secrets 或 Gate 3 staging canary。
