# 小卡「最後一批的三個風險修正」（一條線依序做，一個 commit 一項）

共通規則：repo `D:\Work`，在自己的 worktree 分支工作。先讀 `CLAUDE.md`、`agency-os/AGENTS.md`。先 `git fetch origin && git rebase origin/main`（N6 `ffbab1070`、N5b `b42f169e5`、N10 `e998eb480`、N10 migration 已改號 0172、全域測試等待設定 `vitest.setup.ts` 都在 main）。在自己的 worktree commit，不 push、不動 `main`、不改 `data.mjs`／`WORKLOG.md`／`TASKS.md`；部署不是你的事；不對正式站發布或建信；回報操作者一律繁體中文。NA＝`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

這三項是監工把最後一批四張卡的 RISKS 並排後，判定要處理的。

## 1. N6：發布確認視窗寫的 YouTube 公開／不公開，要是「這則草稿實際會用的設定」
現況：確認視窗顯示的是網站現在的設定（N6 工人的 RISK）。但 YouTube 的公開設定是「做草稿時」寫進那則貼文的 format（N5a：`lib/social/compose.ts`、`app/(shell)/tools/social/model.ts` 的 `youtubeFormat`），之後改網站設定不會變。所以視窗可能寫「不公開」，實際發出去是公開——第一則真發布的驗收（計畫 §11 O4）就是靠「先不公開」把關，這裡不能寫錯。
要做：`TopicsBoard.tsx` 的發布確認（與工作台 `ScheduleWorkbench.tsx` 同一顆）改讀該題目 YouTube 那則草稿的實際 format（經 API 帶回；找 N6 的 `publish` 路由與題目讀取處，不新增路由就能帶最好）；讀不到就寫「無法確認，請到社群草稿看」，不猜。草稿的設定與網站現在的設定不同時，多一行提醒並給「到社群草稿修改」的連結。
測試：草稿是公開、網站已改不公開 → 視窗寫「公開」並出現提醒；讀不到 → 寫無法確認。

## 2. N5b：文章已被人手動發布時，影片沒換成 YouTube 連結，要讓人看得到
現況：`swapEmbeddedVideo` 對已發布文章不改（規則正確），發布流程照樣繼續，只有伺服器 log 有寫（N5b 工人的 RISK）。結果：題目顯示已發布，但文章裡嵌的還是 R2 的 `.mp4`，沒人知道。
要做：這種情況在題目的 `artifacts.publish`（N5a 的 `PublishLog`）記一筆 `note`（例如「文章已先被手動發布，影片仍是原檔，沒有換成 YouTube 連結」），`TopicsBoard` 該題目列顯示這行（黃色提示，不是錯誤）；不改狀態、不擋發布、不另發通知。
測試：已發布文章 → 題目上有這行 note、發布流程仍走完；草稿文章 → 沒有 note。

## 3. N10：會員信的固定文字照網站語言
現況：信裡的固定文字（標題、開頭、按鈕字）寫死中文（N10 工人的 RISK）。Soulful 的內容是英文，開了排程會寄出中英混雜的信草稿。
要做：`lib/crm/member-newsletter.ts` 的固定字串改成依 `siteLanguage(site.defaults)`（`lib/content/brand-voice.ts`）取：繁體中文與英文兩套，其他語言退回英文；字串集中在一個物件，不散落。
測試：英文站 → 固定字串全英文、沒有中文字元；中文站 → 與現在逐字相同。

## 共通
既有資料：三項都不動既有資料。不做無效益測試：只寫上面點名的；沒有新守衛，不做突變。
驗收：NA `npx tsc --noEmit`（`.next/types` 有 6 個舊產物錯誤，忽略）、全套 `npm test`（worktree 裡應全綠）。審查：Codex 額度若仍用完，用 critic 一輪，commit 寫 `ORACLE_WAIVED`。
回報：三項各一行 `FILES／TESTS／RISKS`，加三個 commit。
