# K30 勾「影片」就一定發 YouTube，拿掉「YouTube」勾選

先讀 `briefs/COMMON.md`，再讀這些程式：`lib/content/topics/make.ts`（`draftGroups`、`makeSocial`、`attachTopicVideo`、N5a／N5b 段）、`lib/content/topics/tick.ts`（`waitsForVideo`）、`lib/content/topics/publish-steps.ts`、`lib/content/topics/plan.ts`、`lib/content/video/embed-in-post.ts`（`swapEmbeddedVideo`）、`app/(shell)/tools/content/topics/TopicsBoard.tsx`、`app/api/content/topics/**`。路徑都相對於 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

操作者 2026-11-26 原話：「改成 勾『影片』>>同一支也附在臉書、IG、Bluesky 的貼文上 +發 YouTube，影片會上傳『YouTube』再貼網址回文章 iframe」「影片不上傳WP, 太佔空間」「『YouTube』勾選要拿掉」。

## 現況（監工查證過）
- 題目的 `formats` 有兩種影片選項：`video` 和 `youtube`。只有勾了 `youtube` 才會建 YouTube 草稿（make.ts 的 `platform === "youtube" ? formats.includes("youtube")`）。正式資料：`{article,social,video}` 42 筆，含 `youtube` 的只有 1 筆。
- 現在只勾 `video` 時，文章嵌的是 R2 影片網址（WP 只存連結，影片檔不進 WP 媒體庫；`MEDIA_PRODUCTION_PERSISTENCE_ENABLED=true` 只寫交付紀錄）。臉書、IG、Bluesky 的草稿附的是同一支影片。

## 要的結果
1. 只要題目有 `video`，就照現在 `youtube` 的流程跑：建 YouTube 草稿並先發，拿到公開連結後，把文章裡的影片換成 YouTube 連結（N5b `swapEmbeddedVideo`），之後再發文章和其他頻道。YouTube 的公開設定沿用網站的 `youtubePrivacy`。
2. 文章裡的 YouTube 影片要在 WP 前台顯示成可以播放的 YouTube 播放器（iframe 或 WP 的 YouTube embed 區塊）。請讀 `swapEmbeddedVideo` 換完後實際產生的 markup，確認前台會顯示成播放器。現在只會留下一行網址的話，就改成 YouTube embed。
3. 影片檔一律不進 WP 媒體庫。請確認整條路徑上沒有任何地方把影片上傳到 WP；有的話就拿掉。
4. 拿掉 UI 上的「YouTube」勾選（題目建立、編輯、排程設定，凡是會出現的地方都拿掉）。API 不再接受新寫入 `youtube`；舊資料裡的 `youtube` 讀出來時視同 `video`，不用改寫舊資料列。
5. 網站沒有連 YouTube 頻道時：文章照樣用 R2 影片連結發出，題目上加一條通過但會提醒的檢查「沒有連 YouTube 頻道，文章用影片檔連結」，不擋發布。
6. 估價：YouTube 不收錢，估價不變。請確認估價沒有因為拿掉 `youtube` 而少算或多算。

## 更正（操作者 11-26 補充，以這段為準）
文章不先嵌影片檔，也不做「換掉」這一步。影片先發 YouTube，拿到公開連結後，文章裡只放 YouTube 網址（獨立一行或 WP 的 YouTube embed 區塊，前台由 WP 顯示成播放器）。操作者原話：「影片不上傳到文章裡，只有連結」。有 YouTube 頻道時，跳過 `embedVideoInPost` 的影片檔嵌入。網站沒有 YouTube 頻道時，第 5 點改成：題目停在不通過的檢查「這個網站沒有連 YouTube 頻道，請到社群連上 YouTube 後按重試」，文章和社群都不發；用題目管線現有的失敗通知管道通知；連上後按重試，從 YouTube 那一步接著做（操作者 11-26：「就通知修理」）。

## 既有資料
- 已經發布的題目不動。
- 還沒發布、只有 `video` 的題目：下一輪排程照新規則跑。YouTube 草稿不存在就補建；影片已經嵌進文章的，等 YouTube 上線後換成 YouTube 連結。
- 要寫一個舊資料測試。

## 測試（只寫這些）
- 只有 `video` 的題目會建 YouTube 草稿，而且 YouTube 先發，文章後發。
- 舊資料列含 `youtube`：行為跟 `video` 完全一樣，不會建出兩份 YouTube 草稿。
- 沒有 YouTube 頻道：文章用 R2 連結、有提醒檢查、不擋。
- 換成 YouTube 後，文章的 markup 是 YouTube 播放器。
- API 送 `youtube` 會被拒絕（或轉成 `video`，二選一，寫明你選哪個和原因）。
- 跑 `npx tsc --noEmit`，再跑**全套** `npm test`。不打付費 API，不真的發文。

## 邊界
- 不改影片的做法（場景、配音、片頭）。
- 不加影片縮圖（另案，等操作者決定）。
- 不部署、不 push。
- 不做無效益測試。
- commit 一律用 pathspec。

回報操作者一律用繁體中文。回報格式：FILES／TESTS（全套的數字）／COMMITS／RISKS／一句結論。
