# D1 影片轉深度影片（operation `depth`）

App：`lobster-factory/infra/hetzner-phase1-core/apps/video-workbench`。先讀 `COMMON.md`、`../PLAN.md`、`../RESEARCH.md` §A。
你的 worktree 從 P1 的分支切出：`onnxruntime-node` 與 `backend/face-privacy.cjs` 已在。**照 `face-privacy.cjs` 的寫法做**（FFmpeg 子行程、pipe、取消、清檔、格數檢查），不另起一套。

## 目標
選一支影片＋起訖時間（≤30 秒）→ 主機本機算每格深度 → 輸出一支黑白深度影片（近＝白），存成新素材。免費、不呼叫外部服務。

## 設計（已定）
1. 模型：Intel MiDaS v2.1 small 官方 ONNX（`model-small.onnx`，官方 GitHub release，MIT）。下載＋sha256 釘選照 `scripts/vendor-fonts.cjs`（檔大，不進 git）：新 `scripts/vendor-depth.cjs`＋`vendor/depth/sources.json`，接進 postinstall 與 `Dockerfile`（比照字型那一層）。執行期不連網。
2. 第一趟：FFmpeg 取 `[start,end]`、固定 30 fps、縮到模型輸入大小，RGB 畫格經 pipe 餵模型。
3. 去閃（核心）：MiDaS 每格的輸出只有相對值（尺度與位移每格不同）。每格對前一格已對齊的結果做最小平方法求 `scale`、`shift` 對齊，再做一階時間平滑；最後用**整段**的 2–98 百分位做一次正規化到 0–255。不得逐格各自 min/max 正規化。純函式，可測。
4. 第二趟：灰階畫格經 stdin 餵 FFmpeg，放大回來源顯示尺寸，編成 mp4（yuv420p、無聲）。
5. 耗時：`module.exports.TIMEOUT_MS` 匯出這個工具需要的工作逾時（依實測定）；`backend/api.cjs` 那一行由監工在整合時接，你不改 `api.cjs`。

## 不變量
- I1 原片不動；結果登記成新素材（走 `media.cjs` 既有路徑）。
- I2 `depthStart`／`depthEnd`：數值、`0 ≤ start < end ≤ 片長`、`end − start ≤ 30`；不合 → 明確錯誤，不產生檔。
- I3 輸出格數＝輸入格數，不等就失敗。
- I4 模型 sha256 不符 → 下載腳本失敗；執行期畫格不離開主機。
- I5 取消會結束所有子行程並刪掉產物。
- I6 逐格模型的限制要寫在畫面上：「逐格估算再做去閃；快速運鏡時邊緣可能抖動」。

## 檔案
- 新：`backend/depth-video.cjs`、`scripts/vendor-depth.cjs`、`vendor/depth/sources.json`、`tests/depth.cjs`
- 改：`backend/media.cjs`（`supported` 加 `depth`＋一行分派，寫法同 `privacy`）、`package.json`（postinstall、`test:depth`）、`Dockerfile`（模型層）、`.gitignore`／`.dockerignore`（只為模型檔）、`scripts/tools-workflows.js` 只動 depth 區塊（約 `:118-124`；加 I6 說明）
- 不動：`scripts/tools-0.js`、`backend/api.cjs`、`backend/face-privacy.cjs`

## 驗收
- `node tests/depth.cjs`：對齊純函式（給一串「同一場景但每格尺度位移不同」的假輸出，對齊後相鄰格差 ≈ 0）、I2 各邊界、I3。
- 實跑：一支 CC0／公有領域、有前後景的影片（放 `$env:TEMP`，回報來源網址），取 10 秒。回報：每格推論毫秒數、總耗時（筆電與 `node:24.14.0-bookworm-slim` 容器各一）。
- 去閃證據：同一段分別「有對齊」「逐格各自正規化」輸出，回報兩者相鄰格平均絕對差；抽 6 格拼圖**實際看**，回報近遠是否合理。
- 另量（不出貨）：`Xenova/dpt-hybrid-midas` 的 ONNX 在同一段的每格毫秒數與同 6 格拼圖，圖放 `$env:TEMP`，回報路徑；是否換模型由監工決定。
- `node tests/backend.cjs`、`node tests/privacy.cjs` 仍綠。
