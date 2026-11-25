# P1 肖像權保護（operation `privacy`）

App：`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench`。先讀 `COMMON.md`、`../PLAN.md`。

## 目標
選一支影片 → 主機本機偵測人臉、跨畫格追蹤 → 輸出一支新影片，臉上是馬賽克或模糊。免費、不呼叫外部服務。

## 設計（已定，不重選）
1. 偵測：YuNet `face_detection_yunet_2023mar.onnx`（OpenCV Zoo，MIT）經 `onnxruntime-node`（CPU）。模型檔照 `scripts/vendor-vision.cjs` 的做法：新 `scripts/vendor-face.cjs`＋`vendor/face/sources.json`（官方網址＋sha256），接進 `package.json` postinstall；執行期不連網。
2. 第一趟：FFmpeg 把來源正規化成固定 fps，縮小後的 RGB 畫格經 pipe 餵偵測（長邊 640 起，實測後定）。
3. 追蹤：純函式（放 `backend/face-privacy.cjs` 內，可被測試直接呼叫）：IoU 配對成軌、軌內缺格內插、框外擴、頭尾延伸。
4. 第二趟：Node 依軌跡輸出每格一張低解析灰階遮罩（橢圓）到 FFmpeg stdin；FFmpeg 圖：原片分兩路，一路 `pixelize`（馬賽克）或 `boxblur`／`gblur`（模糊），`alphamerge` 遮罩後 `overlay` 回原片。強度 低／中／高＝塊大小或半徑對臉寬的比例（不是固定像素）。
5. 聲音原樣帶過（`-c:a copy` 不行時 aac）；尊重旋轉（`backend/follow.cjs:39-40` 用 `displayWidth`）。

## 不變量（驗收逐條看）
- I1 原片不動；結果照其他媒體工具登記成新素材。
- I2 一條軌從第一次到最後一次偵測之間，每一格都有遮罩（缺格內插）；頭尾各延伸 0.3 秒；框外擴 ≥25%。寧可多蓋。
- I3 整支片零張臉 → 工作失敗，訊息「沒有偵測到人臉」，不產生素材（不得把沒處理的片標成保護版）。
- I4 遮罩格數＝影片格數，不等就失敗。
- I5 模型 sha256 不符 → 下載腳本失敗；執行期畫格不離開主機。
- I6 上限 5 分鐘；取消（signal）會結束所有 FFmpeg 子行程並清暫存檔。
- I7 結果帶 `{ faces, coveredFrames, totalFrames }`，畫面顯示「偵測到 N 張臉；側臉、遮擋、太小的臉可能漏掉，發布前請逐段檢查」。

## 檔案
- 新：`backend/face-privacy.cjs`、`scripts/vendor-face.cjs`、`vendor/face/sources.json`、`tests/privacy.cjs`
- 改：`backend/media.cjs`（`supported` 加 `privacy`＋`:70-73` 那段加一行分派，寫法同 `follow-track`）、`package.json`／`package-lock.json`（`onnxruntime-node`、postinstall、`test:privacy`）、`scripts/tools-workflows.js` 只動 `:113-117` privacy 區塊（顯示 I7 結果與上限說明）、`.dockerignore`／`Dockerfile` 僅在映像需要時
- 不動：`scripts/tools-0.js`（解鎖由監工在 X1 卡統一做；本機驗證時可暫時拿掉 `:445` 那行，commit 前還原）

## 驗收
- `node tests/privacy.cjs`：追蹤純函式（缺格內插、延伸、外擴、兩張臉交錯不互換）；I3、I4 各一個案例。
- 突變（隱私守衛，各一次）：拿掉缺格內插 → 指名測試變紅 → 還原變綠；拿掉 I3 → 變紅 → 還原。貼輸出。
- 實跑：一支含 ≥2 張臉、有人走動的公有領域或 CC0 影片（放 `$env:TEMP`，不進 repo，回報寫來源網址），馬賽克與模糊各跑一次；抽 10 格轉成圖**實際看**，回報每格「畫面上幾張臉／蓋到幾張」；回報每格偵測毫秒數與 30 秒片總耗時。
- `node tests/backend.cjs` 仍綠。
- 回報 `onnxruntime-node` 在 `node:24-bookworm-slim` 能否載入（能用 Docker 就 `docker build`＋跑一次；不能就寫進 RISKS）。
