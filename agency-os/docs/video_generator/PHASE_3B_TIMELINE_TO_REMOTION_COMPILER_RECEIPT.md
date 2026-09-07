# Phase 3B — Timeline v1 到 Remotion 編譯器收據

**狀態：隔離分支已提交並驗證；未合併、未部署、未改變任何 renderer route、資料庫、R2、UI 或外部服務。**
**日期：2026-09-07**
**工作樹：** `D:\Worktrees\media-video-phase0`
**提交：** `166e0372b318dc59fcd4b11360990f0b9e1ecb1b` (`feat(video): compile Timeline v1 for Remotion`)

## 已交付的編譯邊界

`timeline-remotion.ts` 將已通過結構驗證的 Timeline v1 編譯為 `dynamic-slideshow` 的 renderer payload；它沒有任何 HTTP、R2、Supabase 或 renderer submit 行為。

- 編譯入口：`D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin\lib\content\video\timeline-remotion.ts:138`。
- 輸出保留 Timeline 的 frame rate、每個 output profile 的像素尺寸、圖片 artifact、`cover`／`contain` 裁切與 `cut`／`fade`／`slide_left`／`slide_right` 轉場；profile map 在同檔 `:64-69`。
- artifact resolver 必須提供 HTTPS URL；未解析、HTTP 或格式錯誤 URL 一律拒絕，程式在同檔 `:75-91`。
- 編譯器只接受一條無時間空洞的 generated-image video track；實拍素材、多條 video track、字幕 track 都拒絕，避免靜默遺失語意，規則在同檔 `:93-115`。
- 音訊只接受一條從 0 起、完整覆蓋影片時長的 audio item；其他剪輯形狀回 `unsupported_audio_shape`，規則在同檔 `:117-135`。

為使這些資料不在 renderer 端被忽略，`SceneSeries.tsx` 已擴充為讀取 `crop` 和 `transitionOut`：`D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service\src\compositions\SceneSeries.tsx:14-20`、`:191-205`、`:255-281`。沒有這個 renderer 支援，將 Timeline props 傳入只會造成畫面語意遺失，因此兩側包含在同一提交。

## 驗證

在 Next-admin 實際執行：

```powershell
cd D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\next-admin
npm test -- timeline-v1 timeline-remotion renderer-client-auth
npm run typecheck
```

結果：3 個測試檔、13 個測試通過；`tsc --noEmit` 通過。`timeline-remotion.test.ts:32-75` 覆蓋語意保留、完整 audio、caption／footage／time-gap 的 fail-closed 行為與未解析 artifact URL。

在 Remotion service 實際執行：

```powershell
cd D:\Worktrees\media-video-phase0\lobster-factory\infra\hetzner-phase1-core\apps\remotion-service
npm run build
```

結果：`tsc -p tsconfig.server.json` 通過。工作樹 `git diff --check` 在提交前通過。

可重現交接包為 `_handoff_2026-09-07/media-video-phase0-plus-timeline-remotion-166e0372b.bundle`；`git bundle verify` 已通過，SHA-256 為 `7f5bef1030605823a8c81c3a475a86bc052353fb315a5fdf9f7a65c0cdc0b91a`，前置基線為 `8570b74f07e3c7cd119d747c285f5055f3184742`。

## 刻意未做的事與下一個閘

這不是可提交出片的 Director Engine。現在 `POST /api/video/remotion-render` 仍是既有的手動 props 路徑，直接建立 process-local renderer job；沒有 durable job、資產 ownership／rights、release、QA、idempotency receipt 或 restart reconcile。這個 compiler 必須等 Phase 1B durable job 與 Phase 2 asset/release 邊界完成後，由受控 server adapter 取得 tenant-scoped artifact rendition，再建立 renderer attempt。

因此不會從此提交新增 UI 選項或路由分支，也不會把 Timeline 直接提交到 renderer。既有 Quick Engine 與手動 Remotion 模板路徑不變。

## rollback

未合併前，只需不交付 `166e0372b`。整合後若 adapter 發生問題，revert 此單一提交並關閉尚未建立的 Director capability；既有 Timeline validator、Quick Engine、手動 Remotion 路徑和產物均不受影響。
