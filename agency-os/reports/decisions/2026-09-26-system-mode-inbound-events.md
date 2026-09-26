# 2026-09-26 系統模式 × 外部進來的事件（Printful／Woo／Chatwoot）＋建站派送

決策者：Claude（操作者 2026-09-26「都你決定」全權委派）。狀態：定案，實作 = 雲端 T19／T26／T27。

## 不變量
系統模式（`lib/command-plane/killSwitch.ts` evaluateKillSwitch）只擋**我們發起**的變更；**客戶發起的事件永不因模式遺失**——先落 DB，動作延後或轉人工，模式允許時自動補做。

## 決定
| 路徑 | 決定 | 證據 |
|---|---|---|
| 操作者發起的 Printful 寫入：`app/api/tools/printful/sync`、`app/api/tools/publish` action link／pfcreate／pforder | 走 `checkProductionChangeAllowed` → 共用 423（`lib/system-modes/blocked-change.ts`） | 操作者看得到原因、可重按，無遺失 |
| Woo 付款訂單 webhook `app/api/webhooks/woo-order/route.ts` → Printful 草稿 | HMAC 過後**一律 2xx**；每筆付款訂單寫入 durable inbox；模式允許 → 立即建草稿；否則 `deferred`；補做觸發：下一筆 webhook、`app/api/ops/system-modes/route.ts` POST 切回 normal；AO smoke 偵測 deferred 超時 | WooCommerce `includes/class-wc-webhook.php:544` 只認 200–302；`:562-570` 連續 >5 次失敗自動停用 webhook，且不重送 → 回 423 = 漏單＋可能整條停用。草稿冪等：`createDraftOrderOnNative` 以 `GET /orders/@{wooOrderId}` 查重。prod `POD_AUTO_FULFILL_ENABLED=true`（2026-09-26 printenv） |
| Chatwoot `app/api/webhooks/chatwoot/route.ts` | 擋下的模式 → 不呼叫 AI、不自動回覆，`handoffToHuman`＋私密備註「AI 暫停：系統 <mode>」；一律 2xx | 客戶訊息本就存於 Chatwoot；emergency_stop 的主要用途即停下失常的自動化；route 既有「失敗一律降級 handoff」原則（`route.ts:19-22`） |
| 建站派送 `app/api/build/runs/route.ts` ＋ workflows `dispatch-action-run`／`orchestrate-tenant-provisioning` | 入列前＋執行前都查；執行前被擋 → 以終態＋原因結束，不留 pending（避免模式恢復後自動執行） | 操作者發起的變更，同第一列；T19 |

## 否決的選項
- Woo／Chatwoot 回 423：會漏單、webhook 被停用（見上）。
- Woo／Chatwoot 豁免模式：emergency_stop 停不下失常的自動化；「加豁免」不是修法。

## 回滾
各自 revert；inbox 表有 down script（T26）。
