# 第 4 項：付款 → 合約 → 權利；錢包帳本泛化；營運看得到

**風險** High（金流）　**模型** Opus 5.5　**前置** 第 3 項；4b 另加：待決 1（定期扣款外掛）；待決 3（點數條款與預收）；ADR 015 順序 1（WordPress 一次性碼進入產品門，否則付了錢的人進不來）　**正本** ADR 017 §2、§3、順序 4；ADR 015 §3、§4

## Decision
- **分兩段**（2026-10-23 先後決策，WORKLOG 續36；監工台 NEXT ④）：**4a** 接頭＋收件表＋合約／權利寫入＋錢包 `grant` 入帳＋`/ops/billing`，付款來源只有 `local`（人工：轉帳後操作者登記）＝不碰 Woo、不等待決，第一個自助客戶靠它收錢；**4b** Woo 原生 webhook 六事件、定期扣款、點數條款（待決 1、3）＋ ADR 015 順序 1 一次性碼登入，同一包做。下列設計兩段共用。
- 付款走接頭 `lib/payments/provider.ts`：介面 `{ verify(req), parse(req) → PaymentEvent }`，實作 `woo.ts`（驗 WooCommerce 原生 webhook 簽章 `X-WC-Webhook-Signature` = base64(HMAC-SHA256(body, secret))，secret 即 Woo 後台設定的 webhook secret，存 `WOO_WEBHOOK_SECRET`；不是 Bearer＋HMAC，也不是 `video-billing/` 的 Stripe 驗法，Codex M10）與 `local.ts`（測試與離開 WordPress 用）；設定值 `PAYMENTS_PROVIDER=woo|local`。控制面只認 `PaymentEvent`，不認 Woo 欄位（ADR 017 §0b 第 5、6 條）。
- **收件表** `payment_events(provider, event_id, received_at, processed_at, payload)`，`unique (provider, event_id)`；route 先 insert（衝突＝重送，直接回 `replayed`），再在同一交易處理合約、權利、帳本（Codex M8）。
- 事件六種（Woo 原生 webhook，不經 wp-bridge）：訂單完成、訂閱續約、訂閱取消、點數包購買、**退款**、**拒付**。退款訂閱＝取消；退款點數包＝帳本 `refund` 分錄只退未用部分（0066 `entry_type` 已有 refund）；拒付＝合約權利列改 `suspended`、錢包凍結，人工複核後解（Codex M9）。目標 `app/api/webhooks/woo-billing/route.ts`（新；既有 `app/api/webhooks/woo-order/` 是 Printful 草稿出貨，不混用，Codex R2-9）。
- 控制面處理：用 `plans.woo_product_ids` 查方案 → 0062 upsert（冪等鍵＝Woo 訂閱編號＋事件 id）→ 重算權利列，狀態機固定（ADR 017 §3，Codex R2-2）：換方案＝舊列 `ends_at = now()`、新列 active；取消＝現有列 `ends_at = current_period_end + 寬限`，不新增列；退款＝`ends_at = now()`；拒付＝`suspended`。點數包 → 帳本 `grant` 一筆（冪等鍵＝Woo 訂單編號）。
- 同一帳戶×產品×功能同時只准一筆有效列（客戶列；internal 列由 0117 索引管）：`findActiveEntitlement` 多筆時取最舊（`tables.ts:31`），舊的寬鬆 comp 會蓋過新的 contract（Codex 2026-10-23 `partialreview-98025e41`，既有行為，段 1 後點數功能也適用）。本步寫入方在同一交易結束舊列，並加測試；贈送與合約重疊時誰優先，開工前先定。
- 帳本泛化：`media_billing_accounts`／`media_credit_ledger` → `billing_accounts`／`credit_ledger`，加 `product_key`；migration `0105_credit_ledger_generalize.sql` 用 view 雙名過渡一版（ADR 012 §8 第 4 步「最後、expand-contract」）。
- 試用結束：trial 到 `current_period_end` 無付款 → 權利列 `expired`；資料保留 90 天後由同一個每日 job 標記 `erasure_due`，實際刪除走既有擦除流程（不在本步）。
- 營運看得到：`app/(shell)/ops/billing/page.tsx` 唯讀表：每個計費帳戶的合約、權利、餘額、最近 20 筆帳本；資料只經 `lib/entitlements/tables.ts`。

## 4a 狀態（2026-10-23，WORKLOG 續48 設計與驗證、續51 上線）
- **已上線**（操作者 go）：0120 已套 prod；程式 `f2139d35a`（2026-10-24 03:00 自動部署進容器）；next-admin 已有 `PAYMENTS_PROVIDERS=local`、`PAYMENTS_LOCAL_SECRET`（同值在 `mcp/user-env.ps1`／vault）。
- 登記轉帳：`scripts/secrets-vault.ps1 -Action run -Names @('PAYMENTS_LOCAL_SECRET') -Command 'node lobster-factory/infra/hetzner-phase1-core/apps/next-admin/scripts/record-payment.mjs credit_pack --org <uuid> --units <點數> --ref <轉帳編號>'`（`RUNNABLE_DEMOS.md`）。
- 訂閱付款前要先有方案列（plans 0 筆，操作者定）。
- 與上列設計不同處：狀態機整個在 Postgres 函式 `billing_apply_payment_event`（收件、合約、權利、帳本同一交易）；路由 `app/api/webhooks/payments/[provider]`（4b 的 woo 走同一路由，不另開 `woo-billing`）；設定 `PAYMENTS_PROVIDERS` 是清單（轉帳與 Woo 會同時存在）；錢包凍結＝新表 `credit_wallet_holds`（不動 `media_billing_accounts.status`，video Stripe webhook 會覆寫它）；贈送與合約重疊＝付費合約結束舊贈送列；全功能帳戶（0118）不能買訂閱、能買點數。
- 帳本泛化**不在 4a**：4a 只寫 `grant`／`refund`，現有 `media_credit_ledger` 夠用；留 4b。卡上的 `0105_credit_ledger_generalize.sql` 編號已被 `0105_social_v16` 用掉，4b 另取號。

## Files
- `lobster-factory/packages/wp-bridge-plugin/`（事件 hook＋簽章）→ 版本號 `AWBRIDGE_VERSION`＋`bash scripts/release-wp-bridge.sh`（兩個 repo）
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/api/webhooks/woo-billing/route.ts`、`route.test.ts`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/{contracts,recompute,ledger}.ts`
- `lobster-factory/packages/db/migrations/0105_credit_ledger_generalize.sql`、`.down.sql`
- `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/app/(shell)/ops/billing/page.tsx`

## Acceptance
```bash
cd D:/Work/lobster-factory/infra/hetzner-phase1-core/apps/next-admin && npx vitest run app/api/webhooks/woo-billing lib/entitlements
```
→ 綠；測試名含 `one paid event yields one contract row and one entitlement set`、`replaying the same event id is a no-op via the inbox`、`a cancel event keeps access until period end plus grace and a plan change ends the old row now`、`a credit pack grants once per order id`、`a refund of a credit pack reverses only the unused part`、`a chargeback suspends entitlements and freezes the wallet`、`an invalid X-WC-Webhook-Signature is refused with 401`。
本機 staging（`npm run dev`）：
```bash
curl -s -X POST http://localhost:3000/api/webhooks/woo-billing -H "X-WC-Webhook-Signature: <base64 hmac-sha256 of body>" -d @fixtures/woo-subscription-active.json
```
→ `{"ok":true,"contract":"<uuid>","entitlements":N}`；同一請求再打一次 → `{"ok":true,"replayed":true}`；`/ops/billing` 顯示該帳戶。
真實：Woo 測試模式下單一筆（金流沙盒）→ prod `/ops/billing` 出現合約；`select count(*) from organization_entitlements where status='active'` ≥ 1。
突變：拔掉冪等鍵檢查 → `replaying…` 測試紅；還原綠。
離開 WordPress 測試：`PAYMENTS_PROVIDER=local LOGIN_SOURCES=local CRM_SINK=none npx vitest run` 全綠；在 `lib/entitlements/contracts.ts` 加一行 `import "@/lib/wp-bridge"` → import-boundary 測試紅；移除綠。

## Rollback
webhook route 下架（回 410）；`0105` 的 down 只在 view 過渡期內可套，帳本有新列即前進修（Codex C2）；Woo 側停用 webhook；`git revert`。

## 4b 待決選項（2026-10-24 整理；操作者選，選完寫回 TASKS.md 該待決行與 ADR 017 產品決定表）

研究正本：WORKLOG 2026-10-24「4b 待決選項」條目 §金流研究（含來源 URL）。每題：選項＝操作者直接選一個；★＝推薦；「程式影響」＝選了之後哪張卡會變。

### 待決 1　訂閱每月扣款：外掛＋台灣金流

事實（2026-10-24 查）：台灣登記公司不能直接開 Stripe（stripe.com/global 無台灣）。WooCommerce Subscriptions（WCS，US$279/年）是唯一有自己 webhook topic 與官方 PHP action 的訂閱外掛；SUMO／YITH／WP Swings 都沒查到。台灣金流能接 WCS 自動扣款的：TapPay（整合最完整、站內退刷，但虛擬訂閱商品銀行過件較嚴）、統一金流 PAYUNi Pro（外掛 NT$3,980/年，幕後授權＋Token API，文件完整）、綠界定期定額（cloudwp 外掛 NT$399/月，2023-03 後沒更新，退款要到綠界後台）、藍新定期定額（整合度差、有收款頻率限制）。aware-wave.com 已裝綠界一次付清外掛（`APP_AWARE_WAVE_COMPLETE_REFERENCE.md:870`）。各家爭議款（拒付）通知都沒有官方 webhook 說明，要書面問金流商。

| 選項 | 內容 | 代價 | 程式影響 |
|---|---|---|---|
| **A ★** | WCS ＋ TapPay（自動扣款）；點數包一次性刷卡走同一金流 | WCS US$279/年＋TapPay 月費／費率（各來源 2.4–2.75%，要報價）；先問 TapPay 業務「SaaS 訂閱能不能過件」，不能就改 B | 4b-2 用 WCS 的 PHP action（卡裡已寫 WCS 版） |
| B | WCS ＋ PAYUNi Pro | WCS＋NT$3,980/年；要申請幕後授權、綁伺服器 IP | 同 A，只換金流外掛，4b-2 不變 |
| C | WCS ＋ 綠界定期定額（cloudwp） | 外掛 NT$399/月且三年沒更新；退款要到綠界後台（退款事件改由操作者在 /ops/billing 人工登記 `local` refund） | 4b-2 退款 hook 不做，改 runbook 一行 |
| D | 不買訂閱外掛：賣「12 個月預付」一次性商品，到期前 30 天寄信請客戶再買 | 零外掛費；沒有自動扣款，流失率高；`period_end`＝付款日＋12 個月 | 4b-2 只做 `woocommerce_payment_complete`；`subscription_canceled` 不會自動發生（客戶不續＝到期）；WCS 列全刪 |

決定後第一件事：去金流商開定期定額／Token 扣款（審核 3–5 工作天起），**不卡程式**：4b-1、4b-3、4b-4 不等它。

### 待決 3　點數條款與預收會計

事實：《通訊交易解除權合理例外情事適用準則》第 2 條第 5 款——「非以有形媒介提供之數位內容或一經提供即為完成之線上服務，經消費者事先同意始提供」可排除七日解除權；條件是**事先告知＋消費者事先同意**，告知要放在商品說明旁，只塞在定型化契約裡法院多認定無效（消保處 2016 指引）。會計：2018 起 IFRS 15「預收款項」改稱「合約負債」；收到點數款時是合約負債，扣點時才轉營收。程式已能同時支援「不退」與「只退未用」（0120 `billing_apply_payment_event` 的 `refund/credit_pack` 分支只退未用部分）。

| 選項 | 條款 | 會計 | 程式影響 |
|---|---|---|---|
| **A ★** | 結帳頁必勾「我同意點數購買後立即開始提供，不適用七日解除權；點數不可退、不可轉讓、不可換現金，只能在 AwareWave 產品使用」；同一句放在每個點數包商品說明旁 | 收款開發票、入合約負債；每月底 `/ops/billing` 的「未用點數合計」＝合約負債餘額，給會計師轉營收 | 4b-6（Woo 結帳勾選）＋4b-7（/ops/billing 一欄）；退款事件只用於拒付／人工例外 |
| B | 給 7 天猶豫期：7 天內未使用可全退，用過只退未用 | 同 A，另加「退款分錄」 | 4b-6 條款文字不同；0120 refund 分支現成，不改程式 |
| C | 不退條款＋另加「12 個月未使用失效」 | 失效點數要有「逾期未行使權利」處理（IFRS 15 B44–B47），會計師先確認；台灣消保對點數到期有爭議風險 | 多一個每日 job 標失效＋帳本 `expire` 分錄（0066 `entry_type` 要加值＝migration）；**不建議第一版做** |

A／B 都要會計師一句話確認「收款開發票＋合約負債」；C 另問律師。選完把條款字句交 Woo 店長貼進商品頁與結帳頁，4b-6 只負責「沒勾不能結帳」。

### 待決 5　點數能不能付「沒持有的功能」

事實：`can.ts:40-56` 現在是「有 comp／contract 列先用列、免扣點；沒有列而功能 `billing=credits` 就看錢包」，所以**有錢包的客戶能按次用任何沒買的點數功能**；門已改成「持有該產品任一列才進得了門」（`lib/portal/door-access.ts`），兩邊規則不一致。操作者 2026-10-24：「每個功能都要分開購買或我們送」。目前沒有任何帳戶有點數，改 can() 不影響現況。

| 選項 | 規則（一句） | 不變量 | 代價 | 程式影響 |
|---|---|---|---|---|
| **A ★** | 點數只是付款方式，不是使用權：功能要有一張列才能用；`comp` 列＝免費；`contract` 列＋`billing=contract`＝包在月費裡；`contract` 列＋`billing=credits`＝按次扣錢包 | 「每個功能的使用權永遠來自一張列；錢包只付已持有功能的用量」——與門規則同一條 | 點數功能要先「持有」：點數包商品對應一個 `kind=addon` 方案，`features`＝該產品的 credits 功能、`ends_at` null（4b-2 的 product meta `_awarewave_plan_key` 指它，第一次買包就寫列） | 4b-5 改 `issuePermit`（有 contract 列且 `billing=credits` → `source=credits`、`max_spend`＝錢包；沒列一律拒）＋測試＋突變 |
| B | 維持現狀：錢包即通行證 | 「有錢就能用」 | 與門規則矛盾（進不了門但 API 可用），#11 不成立 | 無 |
| C | 持有產品即可：帳戶持有該產品任一列 → 該產品所有 credits 功能可用點數 | 「使用權在產品層，不在功能層」 | 點數功能無法分開賣／送；與 #1「產品＋加購」勉強相容 | 4b-5 改 `issuePermit` 用 `holdsProduct`；比 A 少一個方案列 |

推薦 A：只有一條不變量、與門、與 #11 一致；代價只是多一個方案列，而方案列本來就要建（plans 0 筆）。

## 4b 設計更新（2026-10-24；取代上方 Decision 的「Woo 原生 webhook、不經 wp-bridge」）

- **事件由 wp-bridge 外掛送，不用 Woo 原生 webhook。** 理由：WCS 沒有「續約成功」topic，只能從 `order.updated` 推論；Woo webhook 失敗 5 次自動停用且不重送（`app/api/webhooks/woo-order/route.ts:20-25`）；換訂閱外掛時 topic 全變。wp-bridge 掛官方 PHP action（WCS action reference），組成 `PaymentEvent` 直接 POST 到既有路由 `/api/webhooks/payments/woo`，用 Action Scheduler（WooCommerce 內建）排隊重試到 2xx 或 4xx；WordPress／Woo 欄位只出現在 PHP 與 `lib/payments/woo-billing.ts`（ADR 017 §0b 第 6 條；`import-boundary.test.ts:14` 的 `PROVIDER_ADAPTERS` 加這個檔）。`lib/payments/woo.ts` 是 wp-bridge 的「寫入 WordPress」接頭，不混用。
- **簽章**：與 `local` 同一構法——`X-AwareWave-Payment-Signature = base64(HMAC-SHA256(raw body, PAYMENTS_WOO_SECRET))`（`lib/payments/local.ts:14`），secret 在 next-admin 環境變數與 WordPress `aware_wave_payments_secret` option（只能由管理員在 wp-bridge 設定頁貼入，不進 git）。
- **會員↔計費帳戶**：新表 `customer_identities(provider text, external_id text, user_id uuid → profiles, organization_id uuid → organizations, created_at; unique(provider, external_id); unique(provider, user_id))`，provider 先只收 `awarewave-wp`（`external_id`＝WP user id，不是 email：ADR 015 §2「email 會改」）。付款事件帶 `wp_user_id`＋`email`＋`display_name`，控制面查表得 `organization_id`；**第一次付款的會員沒有帳戶就當場建**：`organizations`（kind customer，slug 由 email 本地部分＋4 碼亂數）＋ `inviteClientAccount`（`lib/accounts/client-invite.ts:200`，寄「設定密碼」信到該產品門）＋ identity 列；以 `(provider, external_id)` 唯一鍵保證重試不建第二個。訪客結帳（`customer_id=0`）不受理：Woo 設「結帳必須登入」（4b-6），事件仍到就回 400 `guest_checkout`，PHP 不重試並寫訂單備註。
- **商品→方案**：Woo 商品 meta `_awarewave_plan_key`（訂閱商品、點數包商品都填；點數包另填 `_awarewave_credit_units`）是唯一對應；`plans.woo_product_ids` 欄用不到，0124 移除（plans 0 筆）。控制面只認 `plan_key`，不認 Woo 商品 id。
- **event_id**（PHP 產生，重送同值）：`wc:<action>:<order_id|subscription_id>[:<period_end>]`；續約用 subscription id＋期末，同一期重送＝replay；`billing_apply_payment_event` 已處理遲到的舊續約（0120「a late, older event never shortens the period」）。
- **六種事件對應**（WCS 版；待決 1 選 D 時只留第 1、4、5 列）：

| Woo／WCS action | PaymentEvent | 備註 |
|---|---|---|
| `woocommerce_payment_complete`（首單含訂閱商品） | `subscription_paid`，`period_end`＝訂閱 `next_payment`（無則 `end`） | 試用方案：WCS 試用期＝`trial_end`，首單 0 元也會觸發 |
| `woocommerce_subscription_renewal_payment_complete` | `subscription_paid` | 只在續約；首單、switch 不重複觸發 |
| `woocommerce_subscriptions_switched_item` | `subscription_paid`（新 plan_key） | 0120 以 plan 不同判「換方案」 |
| `woocommerce_payment_complete`（訂單只含點數包） | `credit_pack`，`units`＝Σ `_awarewave_credit_units`×數量，`order_ref`＝訂單 id | 同一訂單同時有訂閱與點數包＝兩個事件、兩個 event_id |
| `woocommerce_order_status_refunded`（全額） | 訂閱→`refund/subscription`；點數包→`refund/credit_pack` | 部分退款不送事件，操作者用 `record-payment.mjs` 登記 `local` refund |
| `woocommerce_subscription_status_cancelled`／`_expired` | `subscription_canceled` | `pending-cancel` 與 on-hold（續約失敗）不送：0120 寬限 7 天，之後列自然到期 |
| 拒付 | **不自動**：台灣金流都沒查到拒付 webhook；操作者收到金流商通知後 `record-payment.mjs chargeback --org`（`local`），複核後 `chargeback_cleared` | 4a 已支援 |

- **WordPress 一次性碼進產品門（ADR 015 順序 1，4b-4）**：WP「我的帳號」每個已持有產品一顆「進入」按鈕 → PHP 以同一 HMAC 簽 `{wp_user_id, product_key, ts, nonce}` POST `/api/auth/wp-handoff` → next-admin 查 `customer_identities`、確認 `holdsProduct`、`auth.admin.generateLink({type:'magiclink'})` 取 `hashed_token`，回 `https://<產品門>/login/wp#token_hash=…`（60 秒、一次）→ PHP 302 → 門上 `/login/wp` 用 `verifyOtp` 換 session（同 `/login/set-password` 的作法，`lib/accounts/client-invite.ts:47`）。登入來源 `awarewave-wp` 的程式只在 `lib/auth/sources/awarewave-wp.ts`（`import-boundary.test.ts:14` 已列）。沒有帳戶的會員（還沒付款）按鈕不出現。

## 4b 執行卡（便宜模型照做；每張獨立 commit、各自 Acceptance；順序與依賴如標）

### 4b-1　會員對應計費帳戶（不等待決；Codex 卡 `agency-os/handoffs/codex-queue/cards/02-customer-identities.md`）
- Files：`lobster-factory/packages/db/migrations/0124_customer_identities.sql`＋`.down.sql`；`lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/entitlements/identities.ts`（`findBillingAccount({provider, externalId})`、`linkIdentity({provider, externalId, userId, organizationId})`；只經 service role）；`lib/entitlements/__tests__/identities.test.ts`。
- 0124 內容：上表 `customer_identities`＋RLS（service_role only，照 0120 同一段 `do $$` 樣式）＋`alter table plans drop column woo_product_ids`；down 反向（plans 0 筆、identities 0 筆才能 down，否則 raise）。
- Acceptance：`npx vitest run lib/entitlements/__tests__/identities.test.ts` 綠，測試名含 `an unknown identity resolves to null`、`linking the same identity twice is a no-op`、`one wp user cannot link to two accounts`；`npx tsc --noEmit` 綠；`import-boundary.test.ts` 綠（新檔在 `lib/entitlements/`）。套 prod（High，操作者 go）：照 0120 的套法（WORKLOG 2026-10-23 續51），之後 `psql -c '\d customer_identities'`。
- Rollback：`0124.down.sql`。

### 4b-2　wp-bridge：付款事件（WCS 版；待決 1 選定後開工，選 D 刪 WCS 列）
- Files：`lobster-factory/packages/wp-bridge-plugin/includes/Billing/PaymentEvents.php`（action → PaymentEvent → `as_enqueue_async_action` 排隊）、`includes/Billing/PaymentSender.php`（HMAC、POST、2xx 停、5xx／網路錯重試最多 20 次指數退避、4xx 停並寫訂單備註）、`includes/Admin/AdminPage.php` 加 secret 與目標 URL 欄位＋「送付款事件」開關（預設關）、商品編輯頁 `_awarewave_plan_key`／`_awarewave_credit_units` 兩個欄位、`tests/Billing/PaymentEventsTest.php`；`aware-wave-wp-bridge.php` `AWBRIDGE_VERSION` 升一版。
- 2026-10-25 搬家：收費程式已拆到 `lobster-factory/packages/aware-wave-store-plugin/includes/`（外掛 `aware-wave-store`，只裝 aware-wave.com；wp-bridge 0.19.0 起不含收費）。下列路徑的 `wp-bridge-plugin/includes/Billing/` 讀作該處。
- Acceptance：`composer test` 綠，測試名含 `a paid order with a plan product becomes subscription_paid with the subscription next payment as period_end`、`a credit pack order sums units by quantity`、`a full refund of a pack order becomes refund credit_pack`、`a guest order is dropped with an order note and never queued`、`the same action twice yields the same event_id`；`composer lint` 綠。發版：`bash scripts/release-wp-bridge.sh`（兩個 repo）；aware-wave.com 更新外掛（High）。
- Rollback：關設定頁「送付款事件」開關。
- **必做（critic 2026-10-25 第二輪 M）**：事件帶 `email_verified: true` 只在外掛已證明會員擁有該 email 之後（WooCommerce 不驗 email：註冊時寄驗證信，按連結才標記 `aware_wave_email_verified` user meta）；沒驗證的會員首次付款，控制面回 400 `email_unverified`、不建帳戶、開 ops incident，所以外掛要在結帳前就擋（未驗證不能結帳），否則錢收了帳戶卻開不起來。測試名加 `an unverified member cannot check out and no event carries email_verified true`。

### 4b-3　next-admin `woo` 收件接頭（依賴 4b-1；Codex 卡 `03-woo-billing-provider.md`）
- Files：`lib/payments/woo-billing.ts`（`verify`＝HMAC 同 local；`parse`：body `{event_id, wp_user_id, email, display_name, ...PaymentEvent 去掉 organization_id}` → 查 `findBillingAccount` → 沒有就 `createCustomerFromWp()`（org＋`inviteClientAccount`＋`linkIdentity`）→ 回 `ReceivedPayment`）；`lib/payments/index.ts` `PROVIDERS` 加 `woo`；`lib/entitlements/__tests__/import-boundary.test.ts:14` `PROVIDER_ADAPTERS` 加 `lib/payments/woo-billing.ts`；`lib/payments/__tests__/woo-billing.test.ts`。
- 注意：`PaymentProvider.parse` 現在是同步的（`provider.ts:28`）；改成 `parse(rawBody): Promise<ReceivedPayment>`，`local.ts` 與 route 跟著 `await`。guest（`wp_user_id` 0／缺）→ `PaymentParseError("guest_checkout")`（route 回 400）。
- Acceptance：`npx vitest run lib/payments app/api/webhooks/payments` 綠，測試名含 `a known wp member resolves to its billing account`、`a first-time payer gets an organization, an invite and an identity in that order`、`a retry after a half-made account does not create a second organization`、`a guest checkout is refused with 400`、`an invalid X-AwareWave-Payment-Signature is refused with 401`；突變：拔 `linkIdentity` 的唯一鍵查核 → `a retry…` 紅。prod：`PAYMENTS_PROVIDERS=local,woo`＋`PAYMENTS_WOO_SECRET`（`safe-infra-patch.sh compose`；驗 `docker exec … printenv PAYMENTS_WOO_SECRET`）。
- Rollback：`PAYMENTS_PROVIDERS=local`（路由回 404）。
- 實作（2026-10-25）與上列不同處：組織 slug＝`wp-member-<WP user id>`（不用亂數）——slug 唯一鍵讓重試與兩個同時到的首付事件落在同一列，不會多建組織；帳戶解析放 `lib/entitlements/wp-customers.ts`（`customer_identities`、`plans` 只准在 lib/entitlements）；`PaymentProvider.parse` 改成可同步或非同步（local 照舊同步，不必改呼叫端）；sender 帶 `organization_id` 一律拒（`organization_id_not_allowed`）；寄信失敗但帳戶已建＝照樣連結與入帳。


### 4b-4　WordPress 一次性碼進產品門（依賴 4b-1、4b-3）
- Files：next-admin `app/api/auth/wp-handoff/route.ts`（HMAC 驗章、`ts` ±60 秒、nonce 一次性存新表 `auth_handoff_nonces(provider, nonce) unique`（0125）、`holdsProduct` 不持有回 403）、`lib/auth/sources/awarewave-wp.ts`（generateLink magiclink → 門 URL）、`app/login/wp/page.tsx`（`verifyOtp` 換 session，失敗顯示「連結已失效，回 aware-wave.com 再按一次」）、`middleware.ts` matcher 讓 `/login/wp` 免登入（比照 `/login/set-password`；`middleware-portal-guards.test.ts` 會比對 nginx）、`nginx/default.conf` 門區塊放行 `/login/wp`；wp-bridge `includes/Billing/MyAccountDoors.php`（我的帳號頁按鈕）。
- Acceptance：`npx vitest run app/api/auth lib/auth app/__tests__/middleware-portal-guards.test.ts` 綠，測試名含 `a handoff for a product the account does not hold is refused`、`a replayed nonce is refused`、`a stale timestamp is refused`；本機 `curl -X POST …/api/auth/wp-handoff` 帶正確簽章 → 302 到 `https://tarot.localhost/login/wp#token_hash=…`。上線＝每扇門 nginx 改（High）。
- Rollback：wp-bridge 設定頁關「我的帳號按鈕」；route 下架回 410。
- 實作（2026-10-25）與上列不同處：不建 nonce 表（不用 migration）——nonce 記在程序記憶體（next-admin 單一容器，同 `lib/accounts/staff-accounts.ts`），ts ±60 秒限制重啟後可重放的窗；GoTrue 連結型別用 `recovery`（不會建使用者，同邀請信）；簽章用獨立密鑰 `AUTH_WP_HANDOFF_SECRET`（不與付款共用）；**middleware 與 nginx 都不用改**：matcher 本來就跳過 `login`、`api/auth`（`middleware.ts:445`），門的 nginx 擋 `api/auth`（handoff 只在 app 網域）、放行 `/login/*`（`nginx/default.conf:452`）。上線＝設 `AUTH_WP_HANDOFF_SECRET`＋wp-bridge 按鈕（4b-2 同一包）。


### 4b-5　點數只付已持有功能（待決 5 選 A；High：改 can()）
- Files：`lib/entitlements/can.ts:40-56`（`issuePermit`：找到列且 `feature.billing==="credits"` 且 `row.source==="contract"` → `source:"credits"`、`entitlement_id: row.id`、`max_spend: min(balance, singleLimit)`，餘額不足拒 `insufficient_credits`；找到 `comp` 列照舊免費；沒列一律 `no_active_entitlement`，刪掉「沒列看錢包」分支）；`lib/entitlements/__tests__/can.test.ts`、`customer-drill.test.ts`（`drill-credits` 列改成「有 addon 列＋錢包 50」與「只有錢包、沒列→拒」兩列）；ADR 017 產品決定 #11「待決」改成決定；監工台 `DRILL` 點數列文字。
- Acceptance：`npx vitest run lib/entitlements` 綠，測試名含 `a wallet alone opens nothing`、`a contract row on a credits feature spends the wallet`、`a comp row on a credits feature is free`；突變：把「沒列看錢包」分支加回去 → `a wallet alone opens nothing` 紅。
- Rollback：`git revert`；資料不動。
- 實作（2026-10-25）與上列不同處：扣錢包改為**列上明示**——列的 limits `pay: "credits"` 且功能 `billing: credits` 才扣（點數包的加購方案在 `plans.limits` 標）；照字面「contract 列＋點數功能就扣」會讓 0118 全功能合約（Soulful 代操）在翻 enforce 後開始扣點，突變證明（拿掉明示→Soulful 演練紅）。permit 格式不變（credits 仍 `entitlement_id: null`，列的合約放 `source_ref`）。點數包要附加購方案：外掛在 `credit_pack` 帶 `plan_key`，0128 同一交易寫無期末的使用權列（決定 6＝A，2026-10-25；原「另送 subscription_paid、期末＋1090 天」作廢）。

### 4b-6　Woo 店面設定（操作者在 WordPress 後台做；卡只列清單）
- 結帳必須登入（WooCommerce → 設定 → 帳號與隱私：關閉訪客結帳）；結帳頁條款勾選（WooCommerce 內建「條款與條件」頁＝待決 3 條款全文，勾選才能下單）；每個點數包與訂閱商品的「簡短說明」第一行貼待決 3 的一句告知；商品 meta `_awarewave_plan_key`／`_awarewave_credit_units`（4b-2 的欄位）。
- 會員 email 驗證：外掛 4b-2 的驗證信必須開（設定頁開關），未驗證的會員看不到結帳按鈕。
- 驗證：以測試會員下單一筆 0 元試用 → `/ops/billing` 出現合約；Woo 訂單備註有「已送 AwareWave event wc:…」。

### 4b-7　/ops/billing 加「未用點數合計」（待決 3 選 A／B；無依賴）
- Files：0120 `billing_overview` 不改；`app/(shell)/ops/billing/page.tsx` 頂端一列「全部帳戶未用點數合計 N 點＝合約負債」＝Σ各帳戶 `balance`；測試一條。Acceptance：`npx vitest run "app/(shell)/ops/billing"` 綠。

### 4b-8　帳本泛化（ADR 015 §4 第 2 步；只有會計師要「按產品分」才做）
- `media_credit_ledger` 加 `product_key`（nullable→回填→not null），不改表名（view 雙名過渡的理由已不存在：帳本現在只有 grant／refund 幾筆）；debit 已帶 `featureKey`（`ledger.ts:13` `p_reference_id`），產品可由 `PRODUCTS` 反查，所以**預設不做**，列在這裡避免再議。

### 4b-9　真實付款演練（依賴 4b-6、第一個方案；收第一筆真錢前必做）
- 為什麼：外掛（`aware-wave-store-plugin/tests/`，15 測試）與控制面（`lib/payments`、`lib/entitlements`）各自有測試，但 WordPress→控制面整條沒跑過；2026-10-25 prod `payment_events`＝0。
- 步驟：aware-wave.com 建私密測試商品（訂閱 0 元試用＋NT$1 點數包，`_awarewave_plan_key`／`_awarewave_credit_units` 填好）→ 測試會員（email 已驗證）各下一筆，TapPay 用沙盒卡號 → 逐段看：Woo 訂單備註「已送 AwareWave event wc:…」、`payment_events` 有列、`/ops/billing` 出現合約、`organization_entitlements` active 列、錢包加點、首購自動建帳戶與設定密碼信到信箱、我的帳號「進入」一鍵進門、門內用一次付費功能後 `entitlement.usage` 有列 → 全額退款點數包只退未用 → 取消訂閱後寬限 7 天到期 → WCS 後台手動觸發一次續扣，續約事件到達。
- 驗收：每段一行實際輸出寫進 WORKLOG（REALTEST）；任一段不符 → 開修，修完整條重跑。
- Rollback：外掛設定頁關「送付款事件」；測試帳戶與列用 `record-payment.mjs` 反向登記，不刪列。

### 4b-10　員工後台給／收產品（無依賴；High：權限）
- 為什麼：2026-10-25 查，給某客戶產品只有三條路——付款事件、`organization_all_features`（0118，SQL）、`scripts/record-payment.mjs`（`apps/next-admin/scripts/`）；`/ops/billing` 只讀（`page.tsx:5`）。代操、贈送、「只開部分產品」都要員工能在畫面上做。
- 範圍（開工前先出七段計畫給操作者批准）：客戶頁一個區塊，勾產品＝寫一筆 comp 或 contract 權利列（同一張 `organization_entitlements`，頁面不另存）；收回＝把列設 expired；每次寫稽核；只有 owner／admin。
- 實作（2026-10-29，WORKLOG 同日 4b-10 條）與上列不同處：**只開 comp**——手寫 contract 列會讓客戶自己付款被 0120 拒（`feature_in_another_contract`），拒付也會連帶暫停；合約仍走付款事件或 `record-payment.mjs`。0143 `entitlement_staff_grant/revoke`（與付款函式同一把帳戶鎖、稽核同交易）；代理權 `<產品>.resell` 是另一列勾選；收回只結束頁面當時顯示的那幾次贈送（`source_ref`）。區塊在客戶頁「帳務」分頁。

### 順序與依賴
`4b-1`（現在，Codex）→ `4b-3`（Codex，依賴 4b-1）→ 待決 1 定 → `4b-2` → 待決 3 定 → `4b-6`、`4b-7` → `4b-4`（門上線 High）→ 待決 5 定 → `4b-5`（High）。`4b-8` 不排。`4b-9` 在 4b-6 與第一個方案之後、收第一筆真錢之前；`4b-10` 獨立。每張 done 時在 `data.mjs` `STEPS[3]` 的 `items` 打勾（id＝4b-N）；本卡不寫狀態。
