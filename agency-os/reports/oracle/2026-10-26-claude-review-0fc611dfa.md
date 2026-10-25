# claude-review 0fc611dfa (Card 05 social claim Postiz channel)

reviewer: Claude via cc.py SDK API (author = Codex)
files reviewed: lib/social/store.ts, app/api/social/accounts/claim/route.ts, app/api/social/__tests__/claim.test.ts, app/(shell)/tools/social/Settings.tsx, app/(shell)/tools/social/api.ts
mutation (by Claude, D:/tmp/codex-do): drop requireStaffForNewChannel -> claim.test 1 failed/1 passed; restore -> 2 passed

verdict=**pass**（有 minor，沒有越權或洩漏）

1. 守衛：GET（`app/api/social/accounts/claim/route.ts:10`）與 POST（`:18`）都先呼叫 `requireStaffForNewChannel`。POST 在 `:26` 有 `requireBrandRole(WRITE_ROLES)`，通過。
2. `claimIntegration`（`lib/social/store.ts:230-248`）：
   - 擁有判斷用 `postiz_instance = POSTIZ_INSTANCE` 加 `.in(id)`，和 `resolveConnectAttempt`（`store.ts:326-329`）一致。
   - insert 欄位與 `store.ts:335-336` 完全相同，`23505` 回 409。
   - 找不到 integration 回 404，已被認領回 409。
   - `listUnclaimedIntegrations` 只回 `id`、`identifier`、`name`、`disabled`，沒有跨 brand 資料，且只有員工能呼叫。
3. 改動範圍：只動卡片 Files 清單裡的檔案，加上 `agency-os/reports/review-debt.md`（允許）。`resolveConnectAttempt`、`listAccounts` 和 `accounts/route.ts` 都沒改。沒有 migration、沒有新依賴。
4. `Settings.tsx` 的 `refresh()` 多了切換 brand 時丟棄過期回應的處理（約 `:+40` 起）。這在 Settings.tsx 檔內，不算越界。

Minor（2 條）：
- `route.ts:11`、`route.ts:19`：`x-ops-user-kind` header 檢查和 `requireStaffForNewChannel` 重複，卡片沒要求。它是直接讀 header，沒走 `resolveTenant`，行為可能偏離，建議刪掉。
- 卡片要求的 mutation 沒做：拿掉 `requireStaffForNewChannel`，確認 test 2 變紅，再還原變綠。commit message 寫「被 auto-review 拒絕，沒跑紅燈」。這裡的 test 2 本身守的是 `requireStaffForNewChannel` 這個守衛，所以建議補做一次。

Critical 0 / Major 0 / minor 2
RESULT {"session_id": "67240dad-e72b-4a2d-998d-8c86325bf013", "subtype": "success", "is_error": false, "cost_usd": 0.22175399999999998, "turns": 4, "log": "C:\\Users\\user1115\\AppData\\Local\\ClaudeAgent\\runs\\20261026-003202.log"}
