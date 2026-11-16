# U8.4 部署步驟 — remotion-service 修正（main `646f1698b`）

主機 ks-aw-01 `ssh -p 58122 ubuntu@145.239.195.47`，全部 `sudo`。High：部署前要操作者同意。

## 現況（2026-11-16 唯讀查證）
- 線上容器 `lobster-remotion-service` 的 compose 標籤：project=`render-services`，檔案＝`/root/render-services/docker-compose.yml`，服務名＝`lobster-remotion-service`。**不是** repo 的 `apps/remotion-service/docker-compose.remotion.yml`。
- 這份 compose 只寫 `image: lobster-remotion-service:local`，沒有 `build:`，env 在 `env_file: remotion.env`。映像 `caade14b0ac8`，2026-07-02 從 EU 用 docker save/load 搬來。
- `sg-deploy.sh` 不支援這個服務：`scripts/sg-deploy.sh:306-308` 只收 `/root/lobster-phase1/docker-compose.yml` 裡的服務，其他一律 `fail "... deploy it with its own compose"`。
- `safe-infra-patch.sh compose` 只會 `up -d --no-build`（`scripts/safe-infra-patch.sh:117,189`），**不會建映像**。所以要先手動建映像，再用 patch 重建容器。
- 記憶體 1 GiB 不用改：本機同樣上限下 1080p 6 秒片頭，峰值取樣約 603 MiB。

## 1. 上線
```bash
# 1a next-admin（job-status 路由改成回 200）＋把 /root/Work 拉到 main
sudo /root/lobster-phase1/scripts/sg-deploy.sh next-admin
sudo git -C /root/Work log -1 --oneline      # 必須 ≥ 646f1698b
# 1b 先把現在的映像另存一份當回滾點，再從 repo 建新映像（沿用同一個 tag，compose 不用改 image）
sudo docker tag lobster-remotion-service:local lobster-remotion-service:rollback-20261116
sudo docker build -t lobster-remotion-service:local /root/Work/lobster-factory/infra/hetzner-phase1-core/apps/remotion-service
```
1c. 二選一：
- **做第 2 步**（建議）：patch 會順便用新映像重建容器，這裡不用再做什麼。
- **不做第 2 步**：手動重建容器。
  ```bash
  cd /root/render-services && sudo docker compose -p render-services -f docker-compose.yml up -d lobster-remotion-service
  ```
  缺點：容器重建時會丟掉任務表，重建前送出的任務之後查會得到 404。兩個呼叫端都會把 404 當成「失敗＋原因」。

## 2. compose 加持久卷（讓任務表撐過容器重建；Codex F3）
在 `lobster-remotion-service:` 底下加 `volumes`，檔尾加頂層 `volumes`：
```yaml
    volumes:
      - remotion-jobs:/app/data
```
```yaml
volumes:
  remotion-jobs:
    name: lobster-remotion-jobs
```
套用方式（`safe-infra-patch.sh:7-8` 的用法；它從容器標籤找回 project 和檔案，`:44-68`）：
```bash
sudo cp /root/render-services/docker-compose.yml /tmp/rs-compose.new.yml
# 編輯 /tmp/rs-compose.new.yml 加上面兩段，然後：
sudo docker compose -p render-services --project-directory /root/render-services -f /tmp/rs-compose.new.yml config --quiet && \
sudo /root/lobster-phase1/scripts/safe-infra-patch.sh compose /root/render-services/docker-compose.yml lobster-remotion-service < /tmp/rs-compose.new.yml
```
- 結束碼 0 = 已套用，而且容器 healthy。
- 結束碼 1 = 已自動還原 compose。
- 稽核紀錄：`/root/lobster-phase1/safe-patch.log`。

## 3. 驗證
```bash
sudo docker logs --since 5m lobster-remotion-service | grep -E "container limits|listening"
# 應看到 memory=1073741824 cpus=2
T=$(sudo grep '^RENDER_AUTH_TOKEN=' /root/render-services/remotion.env | cut -d= -f2-)
PNG='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
J=$(curl -s -H "X-Render-Token: $T" -H 'Content-Type: application/json' \
  -d "{\"templateId\":\"scale-bg-text-slideup\",\"props\":{\"imageUrl\":\"$PNG\",\"text\":\"部署驗證片頭\"},\"outputFormat\":\"16x9\",\"fps\":30,\"durationInFrames\":180}" \
  http://127.0.0.1:8733/render | sed -E 's/.*"jobId":"([^"]+)".*/\1/'); echo "$J"
for i in $(seq 1 60); do S=$(curl -s -H "X-Render-Token: $T" http://127.0.0.1:8733/status/$J); echo "$S"; \
  sudo docker stats --no-stream --format '{{.MemUsage}}' lobster-remotion-service; \
  echo "$S" | grep -q -E '"status":"(done|error)"' && break; sleep 5; done
sudo docker exec lobster-remotion-service cat /sys/fs/cgroup/memory.peak 2>/dev/null
sudo docker inspect -f 'restarts={{.RestartCount}} oom={{.State.OOMKilled}}' lobster-remotion-service
sudo journalctl -k --since '-15 min' | grep -i -E 'oom|killed process' || echo no-oom
```
通過條件：
- 約 1 分鐘內 `status:"done"`，`url` 是 https 的 R2 網址，而且能播放。
- `restarts` 沒有增加。
- 記憶體 < 1 GiB，`no-oom`。

選做：測「撐過重啟」（會重啟線上容器）。重送一支，渲染途中執行：
```bash
sudo docker restart lobster-remotion-service
```
啟動後查同一個 jobId，應該拿到 `status:"error"`、`error:"渲染失敗：渲染服務在處理途中重新啟動…請重新送出"`，不是 404。

工作台：在片頭面板送一支 16:9，成片要進素材庫。

## 4. 還原
```bash
# 映像
sudo docker tag lobster-remotion-service:rollback-20261116 lobster-remotion-service:local
cd /root/render-services && sudo docker compose -p render-services -f docker-compose.yml up -d lobster-remotion-service
# compose（只有做過第 2 步才需要）：safe-infra-patch 把原檔備份在旁邊
B=$(ls -t /root/render-services/docker-compose.yml.bak.safe-patch-* | head -1); echo "$B"
sudo /root/lobster-phase1/scripts/safe-infra-patch.sh compose /root/render-services/docker-compose.yml lobster-remotion-service < "$B"
# next-admin：sg-deploy 失敗會自己 rollback；要手動退回就用 /root/lobster-phase1/scripts/rollback-phase1.sh
```

## 風險
- 線上映像是 7 月從 EU 搬來的，這次從 repo 重建，模板（compositions）也會跟著換成 repo 版本；第 3 步那支片頭就是這項的驗證。
- 11-02 的紀錄顯示，第一次渲染時下載了 Chrome Headless Shell（108 MB），雖然有設 `REMOTION_CHROME_EXECUTABLE_PATH`。新容器的第一支片頭可能會多花這段下載時間。
- 線上容器只接 `lobster-net`，但 `docker-compose.yml:969` 寫工作台是經由 `lobster-video-net` 呼叫它。這次沒查證這一點，第 3 步工作台送一支就能驗證。
