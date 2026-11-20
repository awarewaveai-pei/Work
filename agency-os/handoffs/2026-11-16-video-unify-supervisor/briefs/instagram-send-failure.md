# 診斷卡：Instagram 發送失敗的真正原因（不是頻道斷線）

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`。唯讀診斷為主：**不重發任何貼文、不對正式站或正式頻道發布**；正式庫只讀（`timeout 60 ssh -p 58122 ubuntu@145.239.195.47`，`sudo docker exec supabase-db psql -U supabase_admin -d postiz …` 讀 Postiz、`-U postgres -d postgres` 讀主系統）。要改程式就在 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`。回報操作者一律繁體中文。NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 事實（監工 2026-11-20 02:15 查證）
- 2026-11-20 01:42（台北）AwareWave 第一則真發布：同一則社群貼文 `93ced27f-bfea-4096-9f66-d2b78de10cf5`，Facebook 發成功（reel），Instagram 失敗。
- 操作者質疑「之前已經重新連過，怎麼一直斷線」。查證結果**不是斷線**：
  - 主系統 `social_accounts`：instagram `status=connected`（2026-11-19 15:44Z 更新）。
  - Postiz `Integration` `cmvnxspa90001p88sopr0qp60`：`refreshNeeded=f`、`disabled=f`、`tokenExpiration=2126-01-01`。
  - Postiz `Post` `cmwnubqju000aqs8hd51utg89`：`state=ERROR`，`error` = `ApplicationFailure: Unknown Error at InstagramProvider.fetch (social.abstract.ts:632) … instagram.provider.ts:792 … Promise.all (index 0) … InstagramProvider.postPending (instagram.provider.ts:724)`。是 Instagram 在收媒體（建立 media container）那一步回了錯，Postiz 沒留下 Instagram 的原始訊息。
- 主系統寫給人看的訊息卻是：「Postiz 發布失敗（Postiz 未回原因，最常見是 instagram 頻道授權失效）：請到 /tools/social 設定 → 頻道 重新連接 instagram」。頻道明明 connected 卻叫人重新連接，是誤導（SOC-REAUTH `6d053ee29` 加的文字）。
- 這則貼文帶的影片是 16:9 的成片：`https://pub-bd79a1c3b4554025bd92a6192b032427.r2.dev/video/39ad4149_c1b0551d49_感恩節心理學_感恩為什麼讓你更快樂_7_/16x9.mp4`（網址含中文）。

## 要查（依可能性；每一項寫出證據）
1. Postiz 實際交給 Instagram 的媒體網址與參數（Postiz `Post.image`／`settings` 欄、`Media` 表；Postiz 是否先把影片轉存到自己的儲存再給網址）。網址若含未編碼的中文，Instagram Graph API 抓不到是常見原因。
2. 影片規格是否不符 Instagram：比例（16:9 給 feed／reels）、長度、編碼、檔案大小、`post` 與 `reel` 類型。對照主系統 `lib/content/video/platform-ratio.ts` 給 instagram 的預設比例。話題佇列的自動社群貼文是不是一律用主成片（16:9），沒有照平台挑比例？
3. Postiz 完整錯誤（`Post.error` 全文、`sudo docker logs postiz`，時間 2026-11-19 17:42–17:50Z）裡有沒有 Instagram 回的 code／message。
4. 2026-11-18 Soulful 那四則（Instagram 用 4:5）是成功的，對比兩則的差異。

## 要做
- A. 寫出根因與證據（file:line、SQL 輸出）。
- B. 修根因（看結果）：若是比例，話題佇列附影片到社群貼文時，每個頻道照 `platform-ratio.ts` 挑已核准的比例（與 B1 發布頁同一個規則，不另寫）；若是網址，檔名／路徑改成 ASCII 安全或正確編碼，並說明既有檔怎麼處理。
- C. 改訊息（一定要做）：失敗原因未知時先看頻道狀態。`connected` 且 Postiz `refreshNeeded=false` 就**不得**叫人重新連接，改寫「Instagram 拒收這則貼文的媒體（頻道連線正常）」加上 Postiz 給的錯誤摘要；只有頻道真的需要重連時才寫重連。訊息來源集中一處（找 `6d053ee29` 加的函式）。測試：connected＋未知錯誤 → 訊息不含「重新連接」；refreshNeeded → 含。
- D. 不重發那一則；回報「修好後要怎麼重發」的步驟，由監工決定。

## 驗收
NA `npx tsc --noEmit`（`.next/types` 有 6 個舊產物錯誤，忽略）、全套 `npm test`。審查一輪（Codex 沒額度就 critic，commit 寫 `ORACLE_WAIVED`）。

## 回報
`ROOT CAUSE:`（一句＋證據）／`FILES:`／`TESTS:`／`RISKS:`。
