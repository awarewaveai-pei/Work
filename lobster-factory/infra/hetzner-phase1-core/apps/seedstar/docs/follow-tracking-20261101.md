# 人物跟拍實作與 FilmCraft 來源核對 — 2026-11-01

## 已實作

選片與 5 秒至 3 分鐘裁切、開始／結束目前時間與 ±1 秒、載入後自動偵測人物、點選人物框或直接點身體位置、向前與向後追蹤、在指定時間重新選人修正、取消與移除人物、三種平滑程度、9:16 預覽播放／拖曳／時間控制、拖曳固定裁切、保留原始音軌的動態裁切輸出。

使用 Google MediaPipe EfficientDet-Lite0（int8），模型及 WASM 均隨本機程式提供；辨識不傳送影片至外部服務。不採用中國 AI 模型。未框出的人物可用局部畫面特徵追蹤。多人重疊、遮擋、人物出入畫面及外觀相近時可能跟錯，提供時間點修正。這不等於保證所有影片零錯誤追蹤。

## FilmCraft

已閱讀官方 README、Web 限制及實際 auto_reframe 程式碼。採用其時間窗加權平滑與裁切邊界的計算方式，改寫成 shared/follow-math.js；保留 MIT 著作權及授權於 shared/LICENSE-FilmCraft-MIT。人物選取、Google 偵測、區域特徵追蹤與修正點流程由本工作台實作。並未將整個 FilmCraft 編輯引擎換入工作台。

- [FilmCraft 原始碼](https://github.com/storytold/filmcraft/blob/main/crates/render/src/vfx/temporal.rs)
- [FilmCraft MIT 授權](https://github.com/storytold/filmcraft/blob/main/LICENSE-MIT)
- [Google Object Detector 官方文件](https://developers.google.com/edge/mediapipe/solutions/vision/object_detector/web_js)

## 實測

- follow-tracking.cjs：真正的 Google 模型，在僅允許本機請求的測試頁偵測移動人物；框選與未框出人物的身體點選、前後追蹤、修正點、固定裁切拖曳；真實 FFmpeg 輸出 720×1280、5 秒及 AAC。用 FFmpeg 獨立解碼輸出的前後影格，再對 PNG 做人物辨識，確認人物維持置中。
- follow-controls.cjs：自動偵測、取消、追蹤途中改區間、離開工具；不鎖按鍵、不寫入過期結果；預覽在 6 秒來源的 5.5 秒終點停止，時鐘更新。雙人物交錯匹配與歧義不自動換人為演算法單元測試，不冒稱以真實多人影片完成所有場景驗收。
- follow-rotation.cjs：實際建立旋轉中繼資料的影片，驗證顯示尺寸與輸出影格方向／比例，沒有把直拍影片壓扁。
- HTTP Range、suffix range、416 與 HEAD 驗證通過。服務改為串流讀取，避免追蹤跳轉時反覆整檔載入。
- Claude 首輪提出旋轉、預覽控制、串流、模型重試與解碼清理問題，均修正；複查 approve。以凍結檔案和 SHA256 綁定，不冒稱 Git ORACLE artifact。
- 更新目前使用的 4178 安裝目錄，原始素材、使用者資料、金鑰與草稿不複製、不刪除；分鏡靈感六份保護檔 SHA256 未變。沒有重新打包 ZIP。

## 審查原文

```json
{"verdict":"request_changes","findings":[{"severity":"high","file":"backend/follow.cjs","line":40,"issue":"The crop geometry uses `inspectMedia()` width/height. That function (backend/media-inspect.cjs:26) reads the coded `WxH` from the `ffmpeg -i` banner and ignores the displaymatrix rotation. FFmpeg autorotates during transcode, so a rotated phone clip (stored 1920x1080, rotation -90) enters the filter chain as 1080x1920. `scale=2276:1280`, computed from the unrotated size, then squashes it to the wrong aspect. Every sendcmd x/y offset is also computed against that wrong geometry. The browser preview and tracking use the rotated `videoWidth`/`videoHeight`, so the render no longer matches the preview. The older follow-manual path avoided this with `force_original_aspect_ratio=increase`. Phone footage of people is the main input for this feature, so this will happen often.","fix":"Find the rotation (parse `displaymatrix: rotation of ±90` or use ffprobe side_data) and swap width/height when it is ±90 before calling `math.crop`. Or send the browser's displayed `videoWidth`/`videoHeight` with the job and check it against the probe. Add a test with a rotated input."},{"severity":"medium","file":"scripts/tools-follow.js","line":441,"issue":"In `toolFollowAfterRender`, the code that stops preview playback at `followEnd` and updates the `[data-follow-seek]` slider and `[data-follow-clock]` sits after `return;` inside the `if (tool !== \"follow\")` block, so it never runs. It also refers to `media` before that variable is declared. As a result, '播放／暫停預覽' plays past the clip end (the plan just clamps to the last point), the clock span stays empty, and the seek slider only moves on full re-renders.","fix":"Move that block into a helper called from `paint`/`followDraw` (or a `timeupdate` listener) after `media` is resolved. Leave only the cancel-and-return inside the `tool !== \"follow\"` branch."},{"severity":"medium","file":"server.cjs","line":75,"issue":"Range support still calls `fs.readFileSync(file)` on the whole file for every request, then slices the buffer. Responses are `no-store`, so the browser does not cache them. Tracking makes up to 1440 seeks on a separate `<video>`, plus seeks on the visible player, and each unbuffered seek sends a new `bytes=N-` request. For a large source, each of those is a full synchronous read of hundreds of MB that blocks the event loop (including job/API handling) and spikes memory. Files above Node's buffer limit fail outright.","fix":"Use `fs.statSync` for the size and stream `fs.createReadStream(file, { start, end })` (piped to `res`, destroyed on `res` close) for both 200 and 206 responses. Keep the range validation that is already there."},{"severity":"low","file":"scripts/follow-worker.js","line":63,"issue":"`detector` is set to the `createFromOptions` promise. If that promise rejects (for example the tflite file is missing or corrupt), the rejected promise stays cached for the worker's lifetime. Later detect/track calls fail instantly until the user presses cancel or reloads the page. `worker.onerror`, which tells the user to retry, only fires when `importScripts` fails, so following that retry advice does nothing.","fix":"Clear `detector` in a catch (`detector = p.catch(e => { detector = null; throw e; })`), or have the main thread terminate the worker when an init error comes back."},{"severity":"low","file":"scripts/tools-follow.js","line":104,"issue":"When `followMedia` times out or hits an error, the hidden `<video>` is never released: `media` is still undefined in the caller, so `followRelease` is skipped. Its src keeps loading or buffering in the background, and repeated retries pile these up.","fix":"In the reject paths inside `followMedia`, clear the src and call `load()` (or call `followRelease(media)`) before rejecting."}]}
```


## 修正後複查

```json
{"verdict":"approve","findings":[]}
```


## 最終原始碼 SHA256

```json
[
  {
    "file": "shared/follow-math.js",
    "sha256": "5446fc8a4eb66280716ed976fc40447e131a4b0f1cbe27afc7af0ec151acf695"
  },
  {
    "file": "scripts/follow-worker.js",
    "sha256": "28a91caf9d9ab3cfd6921103d407e66f01bdac20a3dff09f1dbb4f955e2cc057"
  },
  {
    "file": "scripts/tools-follow.js",
    "sha256": "315a78de1a92d0f93943e51ea487fe5b92d5c0afe7ca5d58552e8d8e50bbc97a"
  },
  {
    "file": "backend/follow.cjs",
    "sha256": "8e92d6bb3ed8024c10953bb90ff5fc8ee5658a96c9b1b20df74ff0075e93acb5"
  },
  {
    "file": "scripts/tools-workflows.js",
    "sha256": "c1a981895b3bba6365d6bacab9a63334a7583f9fc686600994dcb67a3653f1e4"
  },
  {
    "file": "scripts/tools-boot.js",
    "sha256": "066915548944ef1f64994633f0aee68e47621e7bb412e219188d7fcaea034b7a"
  },
  {
    "file": "scripts/tools-0.js",
    "sha256": "3d5585024830b9f25fcb1d0aa64f381e6e7b3bb0d52da3238260e96829c09bb4"
  },
  {
    "file": "scripts/generator-results.js",
    "sha256": "1d85b9d3a24857075d51876e0e8f7b4e1c5cb0e1cbc615e4067324933cbc0204"
  },
  {
    "file": "backend/media.cjs",
    "sha256": "7d13398e13b1169193d389c7f39fb09ae9af0756f99f2be5f90905e442775a41"
  },
  {
    "file": "server.cjs",
    "sha256": "1e1d552a216947e344495758741807ed3e1640add3454aebf1941f6a44aefcbd"
  },
  {
    "file": "styles/tools.css",
    "sha256": "f8e8dced36052795d7c6cdda4a2b87f0c4ca5a54b9eba652e7b1a80b21347561"
  },
  {
    "file": "package.json",
    "sha256": "097c59d47dc1fd9fd1f5b0fa85bc2cec91977f913e225746bb96cb8e4b824e88"
  },
  {
    "file": "package-lock.json",
    "sha256": "9a64b9824e454c2cfc3fa1d86f211594095bbfbcbef6bfe085ff4cfa800a8021"
  },
  {
    "file": "backend/media-inspect.cjs",
    "sha256": "79ee953525bbbead341049bbf0355e033563faf3e0ec2842ab7e435f4470ed2e"
  }
]
```
