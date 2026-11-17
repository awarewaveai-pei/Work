# U5.3＋U5.4＋U5.5 部署步驟 — video-service 片頭接合＋next-admin＋工作台

主機 ks-aw-01（145.239.195.47，SSH 58122）。以下在已有 root 權限的 SSH session 執行。High：每次部署前取得操作者當下同意。三邊順序＝**video-service → next-admin → 工作台**。併入 main 保留 `DEPLOY_HOLD`，三邊驗收後才移除；這份文件不是部署授權。

## 現況（2026-11-17 唯讀查證）
- 容器 `lobster-video-service`，compose 標籤：project=`video-service`，檔案＝`/root/lobster-phase1/apps/video-service/docker-compose.video.yml`，working_dir 同資料夾，env＝`.env.video`（`chmod 600`，不進 git）。compose 有 `build:`，映像 tag `lobster-video-service:local`（目前 `sha256:b05e2452…`，2026-11-12 建）。
- `/root/lobster-phase1/apps/video-service/{pipeline,server}.py` 的 md5 ＝ `/root/Work` 的 main 版（`7decfcc8…`、`45d5e5e8…`）：線上就是 main，沒有本機改動。
- `sg-deploy.sh` 不收這個服務（`scripts/sg-deploy.sh:306-308`，同 remotion-service）。
- 容器內 ffmpeg 7.1.5（Debian 13）：有 `xfade`、`acrossfade` 的 `nofade` 曲線。本機驗證用 6.1.1。
- `/health` 現在沒有 `bookends`；next-admin 看不到它就拒送片頭（`render-client.ts` submitRender），不會默默出沒有片頭的片。

## 相容（為什麼這個順序）
- 新 video-service 收到舊請求（沒有 `intro`／`outro`）＝ `bookends is None` → 走原本的 concat，指令不變（`tests/test_bookends.py` OldPathUnchanged）。
- 新 next-admin 收到舊工作台請求（`intro:{title,seconds}`、`autonomy`）照舊；新工作台請求要等 next-admin 上線才懂（`until`→`autonomy` 在工作台後端換算，送出的仍是 `autonomy`；`intro.kind`／`outro`／`embedSiteId` 只有新 next-admin 認得）。

## 1. video-service
```bash
set -euo pipefail
git -C /root/Work fetch origin main
git -C /root/Work log -1 origin/main --oneline # 確認包含本卡
context=$(mktemp -d /tmp/video-u54.XXXXXX)
git -C /root/Work archive origin/main:lobster-factory/infra/hetzner-phase1-core/apps/video-service | tar -x -C "$context"
docker tag lobster-video-service:local lobster-video-service:rollback-u54
docker build -t lobster-video-service:local "$context"
docker run --rm --network none --entrypoint python lobster-video-service:local -m unittest discover -s tests -v
compose=/root/lobster-phase1/apps/video-service/docker-compose.video.yml
patch=/root/lobster-phase1/scripts/safe-infra-patch.sh
rollback_video() {
  docker tag lobster-video-service:rollback-u54 lobster-video-service:local
  "$patch" compose "$compose" video-service < "$compose"
}
if ! "$patch" compose "$compose" video-service < "$compose"; then rollback_video; exit 1; fi
if ! curl -fsS http://127.0.0.1:8732/health | python -c 'import json,sys; c=json.load(sys.stdin)["capabilities"]; assert c["bookends"] is True and c["bookend_main"] is True'; then rollback_video; exit 1; fi
```
- 單元測試必須全綠；在隔離新容器跑，不對正式容器跑測試。test_bookends 含三支真 ffmpeg 渲染。
- 重建前必須由主系統 `video_jobs` 列出 running 工作，逐一查其服務端 job 終態，確認沒有執行中的渲染。只看 logs 不能證明空閒；無法確認就停止部署。
- 不同步機器本地 compose 或 env；映像從 git archive 建立。健康失敗會 retag 舊映像，再經 safe-infra-patch 還原。

## 2. next-admin
```bash
DEPLOY_HOLD_OVERRIDE=1 /root/lobster-phase1/scripts/sg-deploy.sh next-admin
```

## 3. 工作台
照工作台既有部署方式（同 U6／U4 的工作台部署）。

## 4. 驗證
```bash
curl -s http://127.0.0.1:8732/health | grep -o '"bookends": true'      # 必須有
```
- **不帶片頭的片輸出不變**（內容工具文章配片也用這個服務）：工作台一集按「快速輸出」，片頭片尾都選「不要」送一支 16:9。成片長度＝各鏡頭配音長度＋每鏡 0.5 秒，字幕第一句從 0 秒附近開始；`sudo docker logs --since 10m lobster-video-service | grep -c bookend` ＝ 0。另在內容工具用文章配片送一支（或等下一支排程配片），能播、有字幕。
- **有片頭**：同一集「一鍵成片」，片頭選標題卡、片尾選標題卡、轉場「交叉淡化」，比例 16:9＋9:16。每個比例一支成片；長度＝片頭＋主片＋片尾−2×0.5 秒；字幕第一句約在片頭秒數−0.5 秒出現。
- **模板片頭只渲染一次**：再按一次一鍵成片（同設定），歷史紀錄裡 `remotion-template` 任務數不變。
- **只換片頭、不重生鏡頭或配音**：成片卡「編輯片頭」儲存後自動渲染；按「加入這支影片」新增一版，舊版保留；鏡頭與配音供應商呼叫數不變。主片在 videomain/ 保留，字幕相對原主片從零開始；接兩次也不疊片頭或累加字幕位移。舊的、已含片頭但沒有主片或原時間軸的成片會明確拒絕，要求從原剪輯輸出一次。
- **做到草稿**：選「草稿」並勾「同時建一篇網站草稿文章並嵌入」→ 排程跑過後專案有社群草稿，WordPress 多一篇**草稿**（不是發佈）文章含影片；`media_production_projects.brief_json` 有 `autoEmbedded`。

## 5. 還原
```bash
cd /root/lobster-phase1/apps/video-service
docker tag lobster-video-service:rollback-u54 lobster-video-service:local
/root/lobster-phase1/scripts/safe-infra-patch.sh compose /root/lobster-phase1/apps/video-service/docker-compose.video.yml video-service < /root/lobster-phase1/apps/video-service/docker-compose.video.yml
curl -s http://127.0.0.1:8732/health        # 沒有 bookends = 已回舊版；next-admin 會拒送片頭，不會出錯片
# next-admin：sg-deploy 失敗會自己 rollback；手動退回 /root/lobster-phase1/scripts/rollback-phase1.sh
```
還原後不用動資料：工作台已存的 `episode.intro|outro|autoRun` 舊程式不讀。

## 風險
- 有轉場時主片會整支再編碼一次（xfade 必須重編碼），片頭越長、主片越長越慢；無轉場時照舊 `-c copy`。
- 模板片頭沒有音軌時補靜音；有配樂時在轉場內淡出，旁白從第一鏡全音量開始。
