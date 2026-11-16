# Risk triage U0 U1 U4 U7（2026-11-16）

來源：四個工人 session 最後回報的 RISKS／未做、oracle `ad3a4f35`／`6e630c84`／`8c798a41`／`0abd1a0f`、commit `79ab5f321` `dd64b4a18` `df5640559` `ea91b5819`。
程式碼證據都以 `D:/Worktrees/Work/u-integrate` HEAD `952d611eb` 為準；路徑前綴：`NA/` = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`，`VW/` = `.../apps/video-workbench/`，`PLAN` = `VW/docs/video-unify-plan-20261116.md`。
正式環境資料是 2026-11-16 用 ssh 唯讀查的（`schema_migrations`、`docker exec printenv`）。

結果：現在修 0 條｜某張卡會處理 4 條｜不用處理 21 條。

| # | 卡 | risk | 證據 | 分類 | 要做什麼 |
|---|---|---|---|---|---|
| 1 | U0 | migration 0164 沒套到任何資料庫 | 正式庫 `schema_migrations` 已有 `0164_media_projects_workbench_source.sql`，applied_at 2026-11-16 05:08 UTC；sha256 `a4f9adf0…` 與 repo 檔案相同（deploy 前的檢查 `check-migrations-applied.sh:30-35` 會放行） | 不用處理 | 已經套用 |
| 2 | U0 | 搶同一個專案時撞到的錯誤碼 23505 沒在真資料庫測過 | `NA/lib/content/video/projects.ts:43`；同樣寫法已在 `NA/app/api/internal/video/workbench/assets/route.ts:245` 等 32 處上線運作 | 不用處理 | 這是現行做法，已經在正式環境跑過 |
| 3 | U0 | db-expert 說一般的 POST 可以繞過 `ensureWorkbenchProject`（工人判斷不成立） | `NA/app/api/video/projects/route.ts:95` 缺 sourceRef 會回 400，`:100-102` video_workbench 只走 ensure | 不用處理 | 工人判斷正確 |
| 4 | U0 | Codex 抓到 webm 能掛上專案，但排程不會處理（已修） | `FINISHED_VIDEO_MIME` 只定義一處，attach 和 `rows()` 共用（commit 79ab5f321） | 不用處理 | 已修 |
| 5 | U1 | Codex：員工網域開 `/video/works` 會被導到儀表板 | `NA/middleware.ts:289-294` 正式環境的產品頁只在自己的網域回應；本機開發才會碰到 | 不用處理 | 只影響本機開發 |
| 6 | U1 | 「作品」只在工作台連得上主系統時顯示 | 素材庫本來就放在主系統（commit dd64b4a18） | 不用處理 | 照設計 |
| 7 | U1 | 搬進 route group 後，影片門會從「已建門頁」的檢查裡悄悄消失（已修） | 新增 `NA/lib/portal/__tests__/app-pages.ts`，能穿過 route group 判斷 | 不用處理 | 已修 |
| 8 | U1 | 舊門頁的選單仍連到 `/works`，會被導回殼裡 | PLAN U11 commit 2：「`(door)/page.tsx` 導向 `/`」 | 某張卡會處理 | U11 |
| 9 | U1 | p6 改路徑後，整套 gate 沒重跑 | `.github/workflows/video-workbench-ci.yml:103` 推上去後 CI 會跑 `node tests/gate.cjs`；sg-deploy 也會在映像內跑同一套（同檔 `:3`） | 不用處理 | push 後看 CI 結果 |
| 10 | U1/U4/U7 | worktree 留著不進 git 的 node_modules 連結、vendor、字型 | 都是 gitignore 的檔案，沒進 commit | 不用處理 | 清 worktree 時一起刪 |
| 11 | U4 | **生圖模型可選（FLUX）沒做**：工作台沒有 FLUX 文字生圖模組 | PLAN:116 §3 對照表「FLUX 生圖 → 鏡頭生圖模型可選｜補｜U4」；U5–U10 都沒提到；U11 會刪掉 `VideoStudio.tsx`（PLAN:233,240） | 某張卡會處理 | U11 驗收表（PLAN:232「§3 每一列走一遍，全部通過才進本卡」）會擋下這一列。**但目前沒有任何一張卡會實作它**：U11 之前要嘛補一張卡（新的 FLUX 供應商模組，照卡片規則要另外開），要嘛由操作者決定把 §3:116 改成「不補」 |
| 12 | U4 | 網址匯入的白名單沒放自家 R2 | `VW/backend/url-import.cjs:15,23-26` 目前只放 Pexels；第一個需要從 R2 匯入的是 PLAN U9「定裝照經 U4 的網址匯入成為參考圖」 | 某張卡會處理 | U9：從同一個共用來源讀 R2 主機，不讀工作台的環境變數 |
| 13 | U4 | 圖庫素材要靠正式環境有 `PEXELS_API_KEY` | `docker exec lobster-next-admin printenv PEXELS_API_KEY` exit 0（2026-11-16）；沒設時 `NA/lib/content/blocks/video-pipeline.ts` 回 503，不會改用付費 FLUX | 不用處理 | 正式環境已設 |
| 14 | U4 | 換新圖後，舊圖做的影片會從鏡頭拿掉；Codex F2（舊的影片任務晚完成會蓋掉新圖，已修） | `VW/shared/episode-spine.js:154-159`：影片只會放到「當初那張圖還在」的鏡頭上 | 不用處理 | 照設計，已修 |
| 15 | U4 | 「讓這鏡動起來」只用首幀模型，4:5／1:1 停用；product-inspect 錯誤訊息改成通用字 | 按鈕寫明模型名，或直接停用（commit df5640559） | 不用處理 | 畫面已經標清楚 |
| 16 | U4 | 圖庫影片上限 100 MB，整檔讀進記憶體 | `VW/backend/url-import.cjs:11,42,49` 有上限，超過回 413；容器記憶體上限 4 GB（`docker inspect`） | 不用處理 | 在上限內 |
| 17 | U4 | `scene-shots.cjs` 在 worktree 跑不起來 | main 原本就壞；不在 `VW/tests/gate.cjs`，也不在 CI | 不用處理 | 不是這條線造成的 |
| 18 | U7 | **(a) 客戶沒設定過「聲音可否外送」時，預設＝可外送**（Codex F1 建議預設擋） | `NA/lib/content/video/transcription.ts:30-33` 只有 `!== false` 才擋；舊字幕派送 `NA/app/api/video/transcription/dispatch/route.ts:49` 用的是同一條規則；PLAN U7 指定沿用它。工作台查詢失敗、沒接主系統都會擋：`VW/backend/audio-policy.cjs:44,47-49` | 不用處理 | 這是產品決定，不是 bug：系統一直都是「沒設定＝可外送」，客戶的設定都照這條規則運作。若改成預設擋，每個沒設定過的客戶的外部辨識都會立刻停用。要改的話只要改 `transcription.ts:33` 一處（`=== true`），新舊兩條路會同時生效；由操作者決定 |
| 19 | U7 | Codex F2：客戶沒接主系統時被放行（已修） | `VW/backend/audio-policy.cjs:44` `if (!main) return !orgId` | 不用處理 | 已修 |
| 20 | U7 | Codex F3：最新 200 支以外的舊成片打不開（已修） | `VW/scripts/tools-subtitles.js:260-263` 不在清單的成片改從 subtitles 路由讀字幕（標成不能重燒） | 不用處理 | 已修 |
| 21 | U7 | 新按鈕沒在瀏覽器實際點過 | 守衛用測試和突變驗過（commit ea91b5819）；重試也走 `start()`，有守衛（`VW/backend/api.cjs:1640` → `:1130`） | 某張卡會處理 | U11 驗收表（PLAN:232）實際點一遍；工作台部署後跑 `/playwright smoke` |
| 22 | U7 | 沒有工作台設定頁，開關放在字幕工具 | `VW/scripts/tools-subtitles.js:286-298` | 不用處理 | 位置跟計畫不同，功能一樣 |
| 23 | U7 | 「改用自家主機重試」只做在字幕工具，剪輯器字幕面板沒有 | PLAN:132 §3 這一列的去處＝字幕工具已做（`tools-subtitles.js:279-283`）；剪輯器面板仍可手動換引擎 | 不用處理 | §3 已有去處 |
| 24 | U7 | `/capabilities` 跟 U4 改到同一行，合併要手動解 | 已合併：`VW/backend/api.cjs:1448-1452` | 不用處理 | 已解 |
| 25 | U7 | 工作台比 next-admin 先上線時，audio-policy 路由會 404 | PLAN §4 共通規則「上線順序＝next-admin 先、工作台後」；就算順序錯，404 也是擋（`audio-policy.cjs:47`），不會外洩 | 不用處理 | 照計畫的上線順序 |
