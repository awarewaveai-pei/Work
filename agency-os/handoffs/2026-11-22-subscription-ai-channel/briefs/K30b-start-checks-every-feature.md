# K30b 題目開始前就檢查它會用到的每一項權限

先讀 `briefs/COMMON.md` 和 K30 的 commit `433149b71`。路徑相對 `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`。

## 問題（K30 工人回報、監工查證）
`app/api/content/topics/[id]/start/route.ts:66-69` 只用 `withFeature` 檢查一項權限：有文章查 `content.article`，否則有社群查 `content.syndicate`，否則查 `video.script`。實際製作時還會用到其他權限：`make.ts:357` 社群和 YouTube 文字用 `content.syndicate`，`make.ts:624` 影片腳本用 `video.script`。K30 之後每個影片題目都要寫 YouTube 文字，缺的權限要到製作中途才失敗，前面那一步的錢已經花掉了。排程自動開始的路徑（`topicDeps().blocker`）完全不檢查權限。

## 要的結果
- 一個題目會用到的權限清單，只寫在一個地方：有 `article` 用 `content.article`；有 `social` 或 `video` 用 `content.syndicate`；有 `video` 用 `video.script`。
- 開始之前把清單上每一項都檢查過，「核准並開始」按鈕和排程兩條路都要檢查，可以放進 `blocker`。缺任何一項就不開始、不花錢，題目寫明缺哪一項權限。按鈕回 409，排程照 K30 那樣退回並通知。
- 檢查用 `lib/entitlements/can.ts` 的 `can()` 或 `grant.ts` 的 `grantFor` 只讀判斷，不能多記任何使用量（`entitlement.usage`）。請讀 `withFeature` 會不會記使用量；路由原本那一次 `withFeature` 照舊保留，不要讓同一項權限記兩次。
- 路由裡註解寫的「literal keys: the registry test reads them」要繼續成立。

## 測試（只寫這些）
- 只勾影片、缺 `content.syndicate` 的題目：按鈕回 409 寫明缺哪一項，排程退回，什麼都沒花。
- 文章＋社群＋影片、缺 `video.script`：同上。
- 權限都有：照常開始，使用量紀錄的筆數跟原本一樣。
- `npx tsc --noEmit`＋**全套** `npm test`。

## 邊界
只改權限檢查，不改製作流程。不部署、不 push。commit 用 pathspec。不做無效益測試。
回報（繁體中文）：FILES／TESTS（全套數字）／COMMITS／RISKS／一句結論。
