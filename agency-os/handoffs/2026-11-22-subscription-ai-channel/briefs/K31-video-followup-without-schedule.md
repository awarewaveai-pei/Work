# K31 人按開始的影片題目，排程沒開也要做完

先讀 `briefs/COMMON.md`。程式路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`：
- `lib/schedules/jobs.ts` 的 `content_pipeline`（約第 139–175 行：`planIfDue`、`dailyIfDue`、`tickTopics`）
- `lib/content/topics/tick.ts`
- `app/api/content/topics/[id]/start/route.ts:36-42`
- `app/api/content/topics/[id]/publish/route.ts:40`
- 主機排程怎麼呼叫 job、排程關掉時會不會跳過（`lib/schedules/`）

操作者 2026-11-27 原話：「手動產文章也會勾影片!」

## 問題
勾了影片的題目，排程「自動內容管線」沒開時，按「核准並開始」或「發布」都回 409（start/route.ts:38、publish/route.ts:40）。

原因是影片後面的步驟都靠 `content_pipeline` 這個 job 裡的 `tickTopics`，每 5 分鐘推進一次：
- 等影片做好
- 發 YouTube
- 把連結放進文章

所以排程沒開的網站，連人自己按也做不了影片題目。

## 不變量
- 人按了開始（或按了發布）的題目，系統一定要自己推進到做完，不管排程有沒有開。
- 排程開關只管「沒人按的自動部分」：
  - 自動規劃題目（`planIfDue`）
  - 每天自動開始已核准的題目（`dailyIfDue`，以及 `tickTopics` 裡負責開始的那一步）
  - 網站設定為自動發布時的自動發布

## 要的結果
1. 把「推進進行中的題目」從排程開關裡拆出來。
   - 範圍：已經開始的題目，也就是製作中、等影片、影片已附上、發布中，以及人按了發布的題目。
   - 這部分每 5 分鐘都要跑，不管 `content_pipeline` 有沒有開。
   - 做法你選：新增一個不能關的系統 job，或讓 `content_pipeline` 關掉時只跑推進。要符合 `lib/schedules` 現有的慣例：時間由主機 cron 決定，Trigger 只當 worker。回報時寫明選了哪個、為什麼。
2. 排程關掉時，不自動開始新題目、不自動規劃、不自動發布。人按的發布照樣執行。
3. 拿掉 start 和 publish 兩個路由裡「要先開自動內容管線」的 409。
4. 推進失敗時的通知（`withTopicStopNotices`）照樣要發。
5. 每天上限、每題花費上限照舊。人按開始的題目算不算進每天上限，維持現狀不改。

## 既有資料
目前正式站 AwareWave 的 `content_pipeline` 是關的，Soulful 要查。上線後要確認兩件事，各寫一個測試：
- 半路上的題目，下一輪就會被推進。
- 排程關掉的網站，已審核的題目不會被自動發出去。正式站 AwareWave 現在有 5 個已審核的題目，而且沒有設自動發布。

## 測試（只寫這些）
- 排程關、人按開始的影片題目：start 不回 409；推進會一路走到等影片、發 YouTube。
- 排程關：已核准但沒人按開始的題目不會被開始；不會規劃；已審核的題目不會被自動發布。
- 排程開：行為跟現在一樣。
- `npx tsc --noEmit`，加上**全套** `npm test`。

## 邊界
- 不改影片的做法。
- 不動 K30／K30b 的規則。
- 不改主機 crontab。要新增系統 job，先看現有 job 怎麼註冊；需要動主機的部分寫進 RISKS 交給監工。
- 不部署、不 push。commit 用 pathspec。不做無效益測試。

回報操作者一律繁體中文：FILES／TESTS（全套數字）／COMMITS／RISKS／一句結論。
