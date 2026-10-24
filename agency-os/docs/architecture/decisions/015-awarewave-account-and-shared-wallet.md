# ADR 015: AwareWave 一個帳號、一個錢包 — WordPress 管會員和收費，點數記在共用帳本，認知平台是第一個接上的產品

- **狀態**：已接受。產品決定由操作者 2026-10-12 拍板；工程做法由 Claude 決定（操作者授權「需要決定的事都你決定」）。**尚未實作**，排在認知平台 2026-10-11 那批修正部署、重走之後。
- **日期**：2026-10-12
- **部分取代**：[ADR 002](002-clerk-identity-boundary.md)，只限 AwareWave 自己賣給客人的產品：客人的帳號改成 aware-wave.com 的 WordPress 會員，不用 Clerk（程式裡從沒用過 Clerk：`grep -rl @clerk` 0 筆）。內部營運介面不在本 ADR 範圍。
- **承接**：[ADR 012](012-shared-platform-layer.md)。本 ADR 補上 012 留著沒定的「金流」，帳本沿用 012 的決定。
- **來源**：操作者的 `cognitive-os-wordpress-architecture-discussion.md`，加上 2026-10-12 的對話。

## 脈絡

- aware-wave.com 是 WordPress，上面會有多個產品。認知平台（cognitive.aware-wave.com）是第一個要賣的，之後還有別的。
- 操作者不想自己做會員、金流、發票、優惠券、CRM、行銷，要用 WordPress 現成的 WooCommerce 和 FluentCRM。也不想為了 WordPress 重寫已經做好的產品。
- ADR 012 已經決定全產品共用一本點數帳本：由控制面擁有，產品不得直讀，用量用簽章回報。帳本以 `lobster-factory/packages/db/migrations/0066_media_billing_and_provider_profiles.sql` 泛化。這張表已經建在正式資料庫，但還沒有任何產品在用：2026-10-12 查 `media_credit_ledger` 0 筆、`media_billing_accounts` 0 筆，影片的收費也還沒設好（操作者確認）。012 把「選哪個金流」留著沒定。

## 操作者決定

| 事 | 決定 |
|---|---|
| 分工 | WordPress 管註冊、登入、買點數、訂單、發票、優惠券、FluentCRM、行銷。各產品只管自己的功能；認知平台管案子、積木、工具、AI |
| 帳號 | 一個 AwareWave 帳號登入所有產品 |
| 網址 | 每個產品一個子網域，認知平台用 cognitive.aware-wave.com |
| 點數 | 全站共用一個錢包，買一次哪個產品都能扣 |
| 扣法 | 照 AI 實際用量扣，每次不固定 |
| 退款 | 點數不退 |
| 錢包做好之前的 AI 上限 | 每人每天 5 萬 token、整個平台每天 200 萬 token（一天最多約 NT$270），在 deploy/.env 設 `COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET_PER_PERSON=50000`、`COGNITIVE_OS_AI_DAILY_TOKEN_BUDGET=2000000`（操作者 2026-10-12 同意） |
| 新註冊 | 送免費點數，價值 NT$30（操作者 2026-10-12 同意），用完之後用自己買的點數（2026-10-12）。送的點數也記在同一本帳，記成一筆 grant，冪等鍵是會員編號，同一個人只送一次 |

## 決策

### 1. 錢包 = ADR 012 的共用帳本；WooCommerce 只是賣點數的店

- 客人在 WooCommerce 買點數包，付款、發票、優惠券、台灣金流（綠界等的 Woo 外掛）都在 WordPress。這就是 012 留著沒定的金流。
- 付款完成時，WooCommerce 送一則簽章通知給控制面，控制面在帳本記一筆加點（grant）。訂單編號當冪等鍵，同一張訂單送兩次只加一次。
- 產品扣點走 012 §4：開始前向控制面要一張短效簽章許可（entitlement_ref），裡面寫這次最多可以花多少；回完再回報簽章的實際用量，控制面記一筆扣點（debit）。產品永不直讀帳本。
- WordPress 會員頁的餘額和明細，向控制面的 API 讀。
- **不採用**：
  - Points and Rewards、store credit：只在結帳時折抵，不能照用量扣。
  - 錢包外掛 TeraWallet（`terawallet/v1/admin/transactions`）：012 已經定了共用帳本放控制面，用它會變成第二本帳；帳放在 WordPress 資料庫也違反 [ADR 005](005-supabase-sor-vs-wordpress-runtime-db.md)（WordPress 資料庫只放站內的東西，系統真相放 Supabase）。它沒有預留功能，1.6.8 版還壞過寫入。0066 已經有冪等鍵，同一筆不會記兩次，也有四種分錄，而且還沒有人在用，現在泛化最省事。
- **扣多少怎麼知道**：每次 AI 回答，供應商都回報確切的輸入和輸出 token 數，平台已經逐筆記在 `ai_usage`。點數 = token 數 × 該模型單價 × 換算率（換算率是可調的設定）。開始前按這次的上限（max_tokens）預留，回完照實際用量扣，多預留的退回錢包。按鈕上先顯示預估花多少，例如工具頁已經顯示「約 22k tokens・≈ NT$3」。
- **能用程式就不用 AI**（操作者 2026-10-12）：AI 只在按鈕按下時才跑，不會自動跑。規則、計算、查詢、範本能做到的就寫成程式，不花點數。盤點：`Projects/internal/cognitive-engineering-os/docs/platform/AI_TO_CODE_AUDIT.md`（41 個按鈕：12 個改程式、10 個程式先做、19 個留 AI；最花錢的是工具結果頁，先加提示快取）。
- 不退點數：不用寫退款分錄。台灣線上數位內容要在結帳前讓買的人勾選同意不退，上線前確認條款。

### 2. 帳號 = aware-wave.com 的 WordPress 會員

- 進產品的方式：WordPress 伺服器簽名說「這是會員 N」，產品回一次性碼，瀏覽器拿碼換登入狀態。簽名照 wp-bridge 的 Ed25519＋防重送（[ADR 007](007-wp-bridge-ed25519-and-reversibility-gating.md)）。
- 產品用 WordPress 會員編號對應自己的身分，不用 email，因為 email 會改。
- 子網域都屬於 aware-wave.com，換手時瀏覽器不會擋登入狀態。不用 iframe：登入狀態會被瀏覽器擋，手機也難用。
- 哪個網址是哪扇門、登入來源怎麼換（含買斷裝在客戶網域）：[ADR 018](018-product-doors-and-buyout-delivery.md)。

### 3. 認知平台這一側（要改的地方）

| 要做 | 接在哪裡 |
|---|---|
| WordPress 簽名開門（新） | 新路由；換登入狀態沿用 `ai_lego/apps/api/main.py:1602` redeem_handoff（60 秒、一次性）。現有 `/auth/handoff/mint`（`main.py:1566`）要先登入平台，不能直接用 |
| 扣點前查許可 | `ai_lego/platform/entitlement/check.py` check_entitlement：每個執行點都已經經過它，目前一律放行 |
| 回報實際用量 | AI 用量已記在 `ai_usage`，透過 `ai_lego/platform/identity/store.py:529` reserve_ai_usage |
| 自行註冊的人放哪 | 先全部放同一個 tenant；學校或機構以後各給一個 |
| 平台自己的 email＋密碼登入 | **不刪**。一般人看不到入口。保留它的理由：操作者在 WordPress 掛掉時要有後門；蒐集器（next-admin）用平台的系統帳號登入存資料；帳號、案子歸屬、權限都靠平台自己的身分系統 |
| 畫面 | Next.js 照用，頁首和顏色跟主站一致；不重做成 WordPress 介面 |
| 隱私 | 個案內容永遠不進 WordPress；WordPress 只知道是誰、買了多少、用了多少 |

### 4. 順序（每段做完，現有產品都照常能用）

1. WordPress 一鍵進入認知平台
2. ADR 012 §8 的授權驗證（entitlement_ref）和帳本泛化（加 product_key）；WooCommerce 付款通知加點；認知平台照用量扣點
3. 會員頁顯示餘額和明細；FluentCRM 標籤（註冊、買點數）

## 後果

- **正面**：會員、金流、發票、行銷都用現成的；所有產品只有一本帳、一個帳號；新產品照同一套接上。
- **負面／代價**：每次 AI 用量都要跟控制面來回（許可＋回報）；控制面停擺時，產品不能開始新的計費動作。帳本泛化：表裡還是空的，趁現在加 product_key，不用雙寫期；第一個產品開始收費之後，再改就要照 012 §3 先擴充、雙寫、再切換。WordPress 變成登入的單一入口，它掛了客人就進不了產品（操作者有後門）。
- **需跟進**：
  - `Projects/internal/cognitive-engineering-os/ai_lego/apps/api/main.py`（簽名開門路由）
  - `ai_lego/platform/entitlement/check.py`
  - `lobster-factory/packages/db/migrations/`（帳本泛化）
  - `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/lib/portal/products.ts`（產品登記，012 §5）
  - WordPress 外掛：開門簽名、付款通知、會員頁餘額。先看 `lobster-factory/packages/wp-bridge-plugin/` 能不能擴充，不能才另做。

## 待查

- ~~「點數不退」的條款寫法~~ 已定（操作者 2026-10-25）：結帳必勾「點數購買後立即提供，不適用七日解除權（通訊交易解除權合理例外情事適用準則 §2 第 5 款）；不可退、不可轉讓、不可換現金，只能在 AwareWave 產品使用」，同一句放每個點數包商品說明旁。
- 對外叫「點數」，不叫「儲值金」（操作者 2026-10-12：只要一本帳）。條款寫明三點：只能在 AwareWave 自己的產品裡用、不能換現金、不能轉讓。能提領、轉讓或拿去別家用，就可能碰到電子支付的法規。
- 會計：賣點數收到的錢入合約負債（IFRS 15，舊稱預收），用掉才轉營收；/ops/billing 頂端「客戶未用點數合計」＝合約負債餘額（操作者 2026-10-25 定）。待會計師一句話確認。
- 第二個產品接上前，確認它照第 2、3 節的做法。
