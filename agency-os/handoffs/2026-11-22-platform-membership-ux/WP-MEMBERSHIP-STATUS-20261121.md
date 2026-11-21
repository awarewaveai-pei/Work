# WordPress 會員／付款 → app：現況查證（2026-11-21，只讀）

路徑縮寫：NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`；STORE = `lobster-factory/packages/aware-wave-store-plugin/`；MIG = `lobster-factory/packages/db/migrations/`；ADR = `agency-os/docs/architecture/decisions/`。
主機實測 = `ssh -p 58122 ubuntu@145.239.195.47`（2026-11-21）：WP 用 `docker exec lobster-wordpress wp --allow-root --path=/var/www/html …`；DB 用 `docker exec supabase-db psql`（只 SELECT）。
本次沒改任何檔與正式站狀態；本機跑過一次 vitest（14 檔）。

## 0. 前提更正（監工的問題陳述有一處與實況不符）

- 「現在實際上是在 app 這邊註冊」**不成立**：app 的自助註冊已在 2026-10-30 刪除。`NA/middleware.ts:277`「Portal signup was deleted 2026-10-30: customers register on aware-wave.com」；`app/portal/` 只剩 `api/door`、`launcher`、`login`、`page.tsx`（`find app/portal -type f`）；`selfSignup` 在 NA 程式 0 筆（grep）。決策紀錄 `agency-os/reports/decisions/2026-10-30-customer-self-signup-email-google.md:11`。
- 實況是**兩邊都不能註冊**：app 沒有註冊頁；aware-wave.com 的註冊與整條 WP→app 通道在同一天晚上被操作者關掉（§6）。現在新客戶只能由員工手建。

## 1. 現行註冊與登入路徑

結論：客戶沒有任何自助註冊入口；`organizations` 列只有四個寫入點，其中三個是員工操作，一個是 WP 付款事件（現已關）。

| 寫 `organizations` 的地方 | 誰觸發 | 證據 |
|---|---|---|
| `POST /api/ops/organizations`（upsert by slug） | 員工 `/onboard` 精靈，需 `canWriteTenantConfig` | `NA/app/api/ops/organizations/route.ts:19-23,51-53` |
| `app/api/onboarding/trigger-build/route.ts`（insert；正式庫這類列的 `metadata.source` = `onboarding_portal`） | 員工建站 | `:167-172` |
| `app/api/build/runs/route.ts`（insert，`source: "build_console"`） | 員工建站台 | `:78-88` |
| `ensureWpOrganization`（insert，slug `wp-member-<wp_user_id>`，`metadata.source=awarewave-wp`） | WP 付款事件第一筆付款 | `NA/lib/entitlements/wp-customers.ts:52-60` |

- 客戶的「人」（GoTrue 帳號）：員工在客戶頁「帳號」按邀請 → `inviteClientAccount`（`email_confirm:false`、無密碼、寄設定密碼信）→ 客戶在 `/login/set-password` 設密碼。`NA/lib/accounts/client-invite.ts:1-9`；路由 `NA/app/api/ops/clients/[slug]/accounts/route.ts:100`。
- GoTrue 公開註冊關閉：`docker exec supabase-auth printenv GOTRUE_DISABLE_SIGNUP` → `true`。
- DB 函式 `portal_complete_signup` 還在正式庫（`select proname from pg_proc` 有列），現行本體在 `MIG/0161_profiles_for_every_auth_user.sql:116`（0110 蓋過 0063）；NA 無任何呼叫者（grep 只剩註解 `lib/entitlements/tables.ts:77`）。容器仍帶 `PORTAL_SIGNUP_ENABLED`、`PORTAL_SIGNUP_RATE_LIMIT_SALT` 兩個變數名（compose `:567-568`），NA 程式 grep 0 筆。
- 登入頁文案（正式站 curl 實測）：`social.`／`studio.aware-wave.com/login` 顯示「從 aware-wave.com 進入」（`NA/app/login/LoginForm.tsx:63-65`、`lib/portal/login-door.ts:8`）；`portal.aware-wave.com/login` 顯示「到 aware-wave.com 註冊」（`app/portal/login/PortalLoginForm.tsx:103`）；`portal.aware-wave.com/signup` → 307。
- `products.ts`：`selfSignup` 欄位已不存在。`loginSources` 現值（`NA/lib/portal/products.ts`）：

| 產品 | loginSources | 行 |
|---|---|---|
| cognitive、hci | local, awarewave-wp | `:43`、`:46` |
| social | local, awarewave-wp, customer-wp | `:49` |
| video、tarot、studio、design、content、cs、collect、outreach | local | `:54,59,65,72,81,86,90,97` |

## 2. WordPress 會員進入（awarewave-wp）

結論：程式兩端都做完、測試綠、10-30 真人走通過；現在被四個開關同時關著。

| 步驟 | 檔:行 |
|---|---|
| WP「我的帳號」列「我的工作區」＋已付款訂單的產品，各一個「進入」按鈕；email 未驗證不列 | `STORE/includes/MyAccountDoors.php:105,124-143` |
| 按下 → WP 伺服器 POST `<target>/api/auth/wp-handoff`，body `{wp_user_id, product_key, ts, nonce, key_id?}`，標頭 `X-AwareWave-Handoff-Signature` | `MyAccountDoors.php:159-164` |
| NA 路由 | `NA/app/api/auth/wp-handoff/route.ts:15-24` |
| 選鑰匙（`key_id` 無 = aware-wave.com）→ 來源沒鑰匙回 404 `source_disabled` → 驗簽 401 → 站停用 403 `site_disabled` | `NA/lib/auth/sources/awarewave-wp.ts:63-67` |
| ts ±60 秒；nonce 格式；nonce 只在簽章與時間都過後才記（`<key_id>:<nonce>`，留 120 秒） | `:32-41,69-71,82` |
| 查 `customer_identities` → 無則 404 `not_a_member`；產品門要持有該產品否則 403 `product_not_held`；`portal`（工作區）不查持有 | `:84-88` |
| 鑄一次性連結：帳號仍是該組織的 client、`email_confirmed_at` 必須有 → GoTrue `generateLink({type:"recovery"})` → `https://<門>/login/wp#token_hash=…` | `NA/lib/auth/door-link.ts:12-31` |
| 瀏覽器在門上換 session | `NA/app/login/wp/page.tsx:1-13`、`app/login/wp/WpSignIn.tsx`；portal 版 `app/portal/login/wp/page.tsx` |

- 驗簽金鑰：aware-wave.com 列是 `hmac-env`，讀環境變數 `AUTH_WP_HANDOFF_SECRET`（須 ≥32 字元，`NA/lib/payments/sites.ts:64-66,78-81`）；WP 端對應選項 `aware_wave_handoff_secret`（`STORE/includes/Settings.php:17`）。其他站用各自 Ed25519 公鑰（`seller_sites.handoff_public_key`，`sites.ts:68-71`）。登入與付款兩把鑰匙分開（`awarewave-wp.ts:8-9`）。
- 防重送的邊界：nonce 記在程序記憶體（`awarewave-wp.ts:35`），重啟會忘最近 60 秒；連結本身是 GoTrue 一次性 token（`:14-16`）。
- 測試（本機實跑，全綠）：`lib/auth/__tests__/awarewave-wp.test.ts` 14、`door-link.test.ts`、`app/login/wp/__tests__/WpSignIn.test.ts`、`app/login/__tests__/login-door.test.ts`；外掛側 `STORE/tests/MyAccountDoorsTest.php`、`SignatureTest.php`（未跑）。
- 開關現值（正式站）：

| 開關 | 現值 | 指令 |
|---|---|---|
| NA `AUTH_WP_HANDOFF_SECRET` | 有變數、長度 0 | `docker exec lobster-next-admin printenv` |
| `seller_sites` aware-wave-com 列 | `status=disabled`、`verify_alg=hmac-env` | psql |
| WP 外掛 aware-wave-store | inactive 1.3.4 | `wp plugin list` |
| WP 選項 `aware_wave_handoff_secret` | 不存在（長度 0） | `wp option get` |
| 對外實測 | `POST https://app.aware-wave.com/api/auth/wp-handoff` → `{"ok":false,"error":"source_disabled"}` | curl |

## 3. WP 會員 ↔ 我們的身分對應

結論：對應表是 `customer_identities`，鍵 `(site_id, external_id)`，`external_id` = WP user id；正式庫 2 列，都是 10-30 的測試會員。

- 表：`MIG/0124_customer_identities.sql:8,13-14`（原鍵 provider＋external_id）；`MIG/0133_seller_sites.sql:78-84` 加 `site_id` 並改唯一鍵為 `(site_id, external_id)`、`(site_id, user_id)`。正式庫索引 `customer_identities_site_external_id_key`、`customer_identities_site_user_id_key`（`pg_indexes`）。欄位：provider、external_id、user_id、organization_id、site_id。
- `lib/entitlements/identities.ts`：只讀寫這張表。`findBillingAccount`（`:26-39`）用 provider＋site＋external_id 找（組織, 使用者）；`linkIdentity`（`:64-93`）插入，撞唯一鍵時只接受三欄完全相同，否則 `identity_conflict`。
- `lib/entitlements/wp-customers.ts`：`ensureWpCustomer`（`:164-209`）= 付款事件裡把 WP 會員變成計費帳戶。已知會員直接回（`:167-168`）；不是付款事件不建帳號（`:169`）；email 未經 WP 驗證不建（`:170`）；aware-wave.com 建「已驗證、不寄信」帳號（`:191-198`），轉售站寄設定密碼信（`:200-208`）；同 email 的員工邀請帳號只在 aware-wave.com 自動連結（`adoptableClient` `:119-133`）。
- 帳號只在**付款事件**建立；註冊當下建帳號靠 0 元「註冊禮」訂單走同一條付款路（`STORE/includes/WelcomeGift.php:80`；決策紀錄 `:9`）。
- 正式庫列數（psql count）：`customer_identities` 2、`seller_sites` 1、`payment_events` 2、`organization_memberships` 3、`profiles` 5、`organization_entitlements` 1105、`plans` 5、`organization_product_subscriptions` 10、`organization_all_features` 3、`media_credit_ledger` 6、`social_brand_members` 1。
- 兩邊已經對不上：WP 現有使用者 id = 1（管理員）、6、7（`wp user list --fields=ID,roles`）；app 的對應列是 external_id 2 與 7。WP 會員 2 已不存在、WP 會員 6 在 app 沒有對應。

## 4. 「單位」與「人」

結論：app 能表達「一個單位多個人」，但只能由員工邀請；WordPress 這條路是「一個會員 = 一個組織」，WP 端沒有任何單位概念。

- app：人掛在組織上＝GoTrue `app_metadata.user_kind=client`＋`org_id`（`NA/lib/auth/door-link.ts:16-19`、`middleware.ts:121-126`）＋`organization_memberships` 一列（`MIG/0001_core.sql:41-45`，`membership_type` 預設 `member`；讀取 `NA/lib/accounts/client-invite.ts:84-87`）。一個客戶帳號只綁一個組織。
- 「誰是管理者」：組織層沒有在用的角色。正式庫 3 列全是 `member`；`owner` 只有已無人呼叫的 `portal_complete_signup` 會寫（`MIG/0161…:135-136`）。角色只存在產品層：社群的 `social_brand_members`（ADR 018 `:45`；`accounts/route.ts:27-30`）。`roles`、`user_role_assignments`、`workspace_memberships` 表存在（`information_schema`），是否有客戶路徑在用未追。
- WP 路：不變量「one member, one organization」（`wp-customers.ts:7`）；已被某會員持有的組織不能再連第二個會員（`:118,125-127`「two members on one account would cancel each other's plans」）。
- WP 端：STORE `includes/` 內 grep `team|company|組織|公司|memberships` 0 筆；正式站沒有 team／membership 類外掛（§6 清單）。監工台記「組織與席位可用 Memberships for Teams，等第一個企業客戶再評估」（`agency-os/handoffs/2026-10-16-customer-model-supervisor/data.mjs:172`）。
- Soulful 現況：正式庫 `soulful-expression` 有 1 個 client 帳號、1 列 membership、0 列 `customer_identities`。要「三個人」＝員工再邀兩個帳號，做得到；從 WordPress 來做不到。

## 5. 付款 → 合約／權利

結論：4a（人工登記）在線上運作；4b 的程式（Woo 事件、建帳號、對帳、扣點）都做完，店面設定（4b-6）與真實付款演練（4b-9）沒做，且通道現在關著。

- 路：WP 外掛掛 Woo／WCS action（不是 Woo 原生 webhook）→ 佇列 → POST `<target>/api/webhooks/payments/woo`（`STORE/README.md:5`；`NA/lib/payments/woo-billing.ts:1-9`）。
- 路由 `NA/app/api/webhooks/payments/[provider]/route.ts`：開關 `:13-14`（`PAYMENTS_PROVIDERS` 沒列就 404）→ 驗簽 `:21,27` → 解析並解出付款人 `:30` → `applyPaymentEvent` `:41`（RPC `billing_apply_payment_event`，0120；正式庫有此函式）。
- 驗簽：標頭 `X-AwareWave-Site` 指站、該站自己的鑰匙驗（`woo-billing.ts:55-64`）；aware-wave.com = HMAC，環境變數 `PAYMENTS_WOO_SECRET`（`sites.ts:12,64-66`）。body 不准自報組織或賣家（`woo-billing.ts:95-96`）。
- 寫入：收件表 `payment_events`（冪等鍵 provider＋event_id）、合約 `organization_product_subscriptions`、權利 `organization_entitlements`、帳本 `media_credit_ledger`；被拒的已簽事件開 ops incident（`woo-billing.ts:21-32`）。
- `lib/payments/sites.ts`：收銀台網站登記表 `seller_sites` 的唯一讀寫者（`:1-5`）：由 key id 找站、驗章（付款／登入兩用途）、站能不能賣某方案（`siteMaySellPlan` `:95-105`）、`/ops/sellers` 的登記與停用。
- 接頭現值：`PAYMENTS_PROVIDERS=local`（printenv）；`PAYMENTS_WOO_SECRET` 長度 0；`POST …/api/webhooks/payments/woo` → `payment_provider_disabled`（curl）。程式的值域只有 `local`、`woo`（`NA/lib/payments/index.ts:9-12`），沒有 stripe。
- 進度（監工台 `…/2026-10-16-customer-model-supervisor/data.mjs:135-151`）：4a done；4b-1/2/3/4/5/7/10/11/12/13 done；**4b-6 todo**（WCS、綠界、PayPal、結帳必登入、條款勾選、商品對應方案）；**4b-9 todo**（真實付款演練）；4c-1/2/4 done；4c-3 todo（第一個代理商網站）。
- 正式庫：`payment_events` 2 列，都是 10-30 的 `woo credit_pack`（訂單 41、46 的註冊禮）；那兩個帳戶的 10 個合約全 `canceled`、56 列權利 `expired`。沒有任何真錢付款。

## 6. WordPress 端現況（aware-wave.com 正式站）

結論：WooCommerce、FluentCRM 在跑；我們的店外掛停用、註冊關閉、沒有訂閱外掛與金流外掛；「我的帳號」沒有「進入產品」入口。

`wp plugin list --fields=name,status,version`（2026-11-21）：

| 外掛 | 狀態 | 版本 |
|---|---|---|
| aware-wave-store | **inactive** | 1.3.4 |
| aware-wave-wp-bridge | active | 0.22.0 |
| woocommerce | active | 11.2.1 |
| fluent-crm／fluentcampaign-pro | active | 3.1.8 |
| fluentform／fluentformpro | active | 6.2.5／6.2.4 |
| fluent-smtp | active | 2.4.1 |
| nextend-facebook-connect（Nextend Social Login） | active | 3.1.26 |
| simple-cloudflare-turnstile | active | 1.44.3 |
| antispam-bee、limit-login-attempts-reloaded、mainwp-child、phys-core、simple-history、wp-2fa、wpvivid-backuprestore | active | — |
| mu：aw-login-audit、posthog、sentry | must-use | — |

- 清單裡**沒有**：WooCommerce Subscriptions、綠界、WooCommerce PayPal Payments、任何 membership／team 外掛。
- 選項：`aware_wave_payments_enabled=0`；`aware_wave_payments_target`、`aware_wave_welcome_product_id`、`aware_wave_site_key_id`、`aware_wave_payments_gateways` 不存在；兩把密鑰與兩組 keypair 長度 0；`users_can_register=0`；`woocommerce_enable_myaccount_registration=no`；`woocommerce_enable_guest_checkout=yes`。
- 「我的帳號」頁（curl `https://aware-wave.com/my-account/`）：有登入表單、Nextend 按鈕、Turnstile；沒有註冊表單、沒有「我的 AwareWave 產品」區塊（該區塊由停用中的外掛輸出，`MyAccountDoors.php:133`）。
- WP 使用者 3 個：1 管理員、2 subscriber。
- 2026-10-30 切掉的內容：`agency-os/WORKLOG.md:5910`「2026-10-30（續36）停用：aware-wave.com 只留 WordPress，與 app 完全無關；註冊禮送出的點數與產品收回」——兩個外掛停用（未刪）；刪 `aware_wave_welcome_product_id`、`aware_wave_handoff_secret`、`aware_wave_payments_secret`；`aware_wave_payments_enabled=0`；Woo 註冊 `no`；app `.env` `PAYMENTS_PROVIDERS=local`、兩密鑰清空；`seller_sites` → disabled；兩個測試帳戶權利 56 列過期、合約 10 取消、錢包歸 0。該條目無程式 commit（設定與資料操作）；備份檔與 rollback 步驟寫在同條目。起因條目：`WORKLOG.md:5931`（續34，真人註冊後進門四個問題）。
- 之前做出來的東西（commit）：`125cdad43`（woo 事件解出會員、一次性登入）、`b22ce2277`（每站自己的鑰匙）、`4632004bb`（wp-handoff 收 `portal`）、`da0804a30`（door-link 單一鑄造點）、`3acb55811`（進門修正）、`420233a4c`（註冊只在 aware-wave.com、刪 portal 註冊）。
- 2026-11-02 bridge 重新啟用：`WORKLOG.md:5130`（續10）；store 維持停用。

## 7. 現有 8 個 organizations 的來源

結論：8 個裡只有 2 個來自 WordPress（都是測試、已收回），其餘 6 個是種子資料或員工手建；Soulful 沒有對應的 WP 會員。

| slug | status | kind | 來源（`metadata.source`／證據） | 對應 WP 會員 |
|---|---|---|---|---|
| awarewave-ops | active | internal | source 空；slug 出現在種子 MIG `0012_seed_ops_console_minimal.sql`（grep 命中，未讀內文） | 無 |
| soulful-expression | active | customer | source 空；2026-05-08 建；未能查證是哪一支插入的 | 無（identities 0 列） |
| test-wp-webhook-co-c705c6 | active | customer | `onboarding_portal`（員工 onboarding） | 無 |
| e2e-verify-0704-5c1356 | active | customer | `onboarding_portal` | 無 |
| mongolia-03-6fc1c8 | inactive | customer | `onboarding_portal` | 無 |
| edd-research | active | customer | source 空；2026-09-17 建；未能查證建立方式 | 無 |
| wp-member-2 | active | customer | `awarewave-wp`（10-30 註冊禮付款事件） | identities 有列，但 WP 已無 id 2 |
| wp-member-7 | inactive | customer | `awarewave-wp` | 有，WP id 7 仍在（subscriber） |

權利現況（psql）：awarewave-ops comp 349、edd-research comp 349、soulful-expression contract 349（三者在 `organization_all_features`）；wp-member-2／7 各 28 列 expired。

## 8. 「離開 WordPress」規則

結論：只做了一半——「核心不得 import WordPress／Woo／Fluent」有閘且綠；「以 local／[local]／none 跑整套測試」這個測試不存在，`crm` 接頭設定也不存在。

- 有：`NA/lib/entitlements/__tests__/import-boundary.test.ts`。接頭白名單 `:15`（`lib/payments/woo.ts`、`lib/payments/woo-billing.ts`、`lib/auth/sources/awarewave-wp.ts`、`lib/crm/fluentcrm.ts`）；規則 `:17-25`；掃 app＋lib 全部來源 `:95-103`。本機實跑：5/5 通過。
- 閘的邊界：只看 import 的路徑字串。`lib/entitlements/wp-customers.ts` 是核心目錄內、專講 WordPress 會員的檔，因為 import 路徑不含那幾個字而不被擋（`:12-15` 的 import）。
- 無：grep `離開 WordPress|leave-wordpress|without wordpress|payments=local` 於 NA 與 `scripts/` 0 筆測試。ADR 017 `:53` 要求的整套替代設定測試未能查到。
- 無：`crm: fluentcrm | none` 設定。容器無 `CRM_PROVIDER`；`products.ts` 與各 `MODULE_MANIFEST.json` grep `crm` 0 筆；`lib/crm/fluentcrm.ts:2` 直接用 bridge 傳輸。
- 旁帶發現（與本題無關、未處理）：同一次實跑 `lib/portal/__tests__/products.test.ts` 1 紅：`tools/seedstar: exactly one owner`（`:152`），工作樹現況。

## 9. 缺口清單

目標：付費單位只在 aware-wave.com 註冊成會員；app 不再自辦註冊；app 的客戶名單是 WordPress 的副本。

### 已完成（7）

| # | 項目 | 證據 |
|---|---|---|
| D1 | app 自助註冊頁與 API 已刪 | `middleware.ts:277`；`find app/portal` |
| D2 | GoTrue 公開註冊關閉 | `GOTRUE_DISABLE_SIGNUP=true` |
| D3 | 身分對應表與每站鑰匙（0124、0133、0140）已套正式庫 | psql 索引與 `seller_sites` 列 |
| D4 | 人工付款 → 合約／權利／帳本（4a）＋`/ops/billing` | `data.mjs:135`；`PAYMENTS_PROVIDERS=local` |
| D5 | 產品門只讓持有產品的帳戶進 | `NA/lib/entitlements/door-holds.ts:6-15` |
| D6 | 核心不 import WP／Woo／Fluent 的閘 | `import-boundary.test.ts`，實跑綠 |
| D7 | 門的登入頁已改成指向 aware-wave.com | curl 三個登入頁 |

### 已做但關著（8）

| # | 項目 | 開關在哪 |
|---|---|---|
| O1 | 店外掛（付款事件、email 驗證、進入按鈕、註冊禮、Google 註冊、對帳端點） | `wp plugin list`：aware-wave-store inactive |
| O2 | WP→app 一次性登入 | NA `AUTH_WP_HANDOFF_SECRET` 空＋WP `aware_wave_handoff_secret` 已刪 |
| O3 | Woo 付款事件接收 | NA `PAYMENTS_PROVIDERS=local`（缺 `woo`）＋`PAYMENTS_WOO_SECRET` 空＋WP `aware_wave_payments_secret` 已刪、`aware_wave_payments_enabled=0` |
| O4 | 收銀台登記 | `seller_sites` aware-wave-com `status=disabled` |
| O5 | WP 會員註冊 | `woocommerce_enable_myaccount_registration=no`、`users_can_register=0` |
| O6 | 註冊即建 app 帳號（0 元註冊禮） | 選項 `aware_wave_welcome_product_id` 已刪；Woo 商品是否還在未查 |
| O7 | 每日 Woo 對帳 | 跟著 O3（`NA/lib/payments/woo-reconcile.ts:140`） |
| O8 | 權利強制 | `ENTITLEMENT_MODE` 未設＝shadow（ADR 017 `:99`）；翻 enforce 屬 High |

備份與還原步驟：`WORKLOG.md:5910` 條目末「rollback（要重開時）」。操作者記憶註明：重開前要有一條自動化的客戶全程走查是綠的。

### 未做（11）

| # | 項目 | 證據 |
|---|---|---|
| N1 | 「單位有多個人」從 WordPress 來：WP 無單位概念，程式不變量是一會員一組織 | §4 |
| N2 | 既有客戶（Soulful）對應到 WP 會員：無對應列；現成的自動連結只在「該 email 第一筆付款事件」時發生 | §4、§7；`wp-customers.ts:179-185` |
| N3 | 「客戶名單是 WP 的副本」的同步：只有付款事件會建列；WP 會員改 email、被刪除，app 都不會知道 | 無 `delete_user`／會員異動 → app 的事件（`STORE/includes/EmailVerification.php:74-75` 只處理本站驗證）；實例：WP id 2 已刪、app 仍 active；WP id 6 無對應 |
| N4 | 員工手建客戶的三條路仍在，名單可以不經 WordPress 產生 | §1 表前三列 |
| N5 | 訂閱外掛與金流（WCS、綠界、PayPal）、結帳條款勾選、商品對應方案（4b-6） | `wp plugin list` 無；`data.mjs:139` |
| N6 | 結帳必登入：正式站 `woocommerce_enable_guest_checkout=yes`；訪客付款會被 app 拒收（`guest_checkout`） | `woo-billing.ts:97-98` |
| N7 | 真實付款全程演練（4b-9） | `data.mjs:146` |
| N8 | 訂閱方案：`plans` 只有 5 個點數加購方案，沒有任何 base 訂閱方案 | psql `plans`（全 addon） |
| N9 | 會員頁顯示點數餘額與明細、FluentCRM 註冊／購買標籤（ADR 015 `:66`） | STORE `includes/` grep `fluent|餘額|balance` 0 筆 |
| N10 | 「離開 WordPress」整套替代設定測試、`crm` 接頭設定 | §8 |
| N11 | 進門防重送跨重啟：nonce 只在記憶體 | `awarewave-wp.ts:13-16,35` |

### 程式／正式站 與 ADR 互相矛盾之處（9）

| # | ADR 寫的 | 實況 |
|---|---|---|
| X1 | ADR 015 `:3`「尚未實作」；ADR 018 `:44`「`local`（現在唯一做好的）」 | awarewave-wp 與付款事件都已實作並上線過（§2、§5） |
| X2 | ADR 015 `:45` 進門簽名照 wp-bridge 的 Ed25519＋防重送（ADR 007） | aware-wave.com 用 HMAC-SHA256 共用密鑰（`awarewave-wp.ts:7-8`、`sites.ts:12`）；Ed25519 只給其他站 |
| X3 | ADR 018 `:44` 每個產品在登記表宣告可用登入來源 | 8 個產品只列 `local`，但 aware-wave.com 的進門不看這張清單（`awarewave-wp.ts:75-80`，註解寫「哪個對由操作者決定」）；只有 customer-wp 受清單限制 |
| X4 | ADR 017 `:48` 登記列有 `selfSignup`；`:76` 註冊時寫 14 天 trial；ADR 018 `:25` portal 是「現有的註冊與啟動頁」 | `selfSignup` 與 portal 註冊已刪；trial 只存在於無人呼叫的 DB 函式 |
| X5 | ADR 017 `:52-53` 接頭 `payments: woo|stripe|local`、`crm: fluentcrm|none`，並有整套替代測試 | 只有 `local`、`woo`；無 crm 設定；無該測試（§8） |
| X6 | ADR 015 `:26` 新註冊送 NT$30 | 決策紀錄 `2026-10-30-…:9` 與實作是 50 點（1 點＝NT$1，ADR 017 產品決定 #11） |
| X7 | ADR 017 產品決定 #3（`:198`）訂閱用 WooCommerce Subscriptions | 正式站未安裝 |
| X8 | `woo-billing.ts:97` 註解「aware-wave.com requires an account at checkout」 | 正式站訪客結帳開著（N6） |
| X9 | 各門登入頁與 portal 登入頁叫人「到 aware-wave.com 註冊／進入」 | aware-wave.com 註冊關閉、無「進入」按鈕；客戶照畫面走是死路 |

## 10. oracle.aware-wave.com（算命站）

結論：它是獨立的 Next.js 應用，不在產品登記表；線上沒有登入、沒有付款、沒有資料庫；主機上沒有對應的 WordPress；「改成 WordPress 門面」目前是計畫＋一支未安裝的外掛＋repo 裡尚未部署的引擎端程式。

**(a) 技術棧、原始碼、容器、導流**

| 項 | repo | 主機實況 |
|---|---|---|
| 原始碼 | `Projects/internal/ziwei-doushu/`（`package.json:2,19-21`：next 16.2.9、react 19.2.4、openai ^6.45） | — |
| 容器 | compose `lobster-factory/infra/hetzner-phase1-core/docker-compose.yml:962-981`（服務與容器名 `oracle-web`，build `./apps/oracle-web`，env 來自機器本地 `.env.production`） | `docker ps`：`oracle-web | oracle-web:local | Up 20 hours (healthy)`；環境變數名只有 `NODE_ENV OPENAI_API_KEY OPENAI_MODEL_DEEP PORT` |
| 內層 nginx | `…/nginx/default.conf:404-423`：`server_name oracle.aware-wave.com` → `http://oracle-web:3000` | `docker exec lobster-nginx grep`：同樣 405、423 行 |
| 主機 nginx | — | `/etc/nginx/sites-enabled/sg-stack.aware-wave.com:17,26` 的 `server_name` 含 `oracle.aware-wave.com` |
| 對外 | — | `/api/health` 200；`/` 307 → `/zh-TW` |
| 部署 | `sg-deploy.sh oracle-web`，不在每晚自動部署；線上 `4adb301f3`（`agency-os/handoffs/2026-11-20-oracle-skills-supervisor/DISPATCH.md` 批次表「部署」列） | — |

**(b) 登記、登入、付款**

- `NA/lib/portal/products.ts` grep `oracle` 0 筆：未登記。
- 登入：無。`app/api/interpret/route.ts:19-20` 註明每日次數計量、auth、Turnstile「待帳號階段接上」，匿名期間只擋 premium 層。
- 付款：無。`lib/payments/gateway.ts`、`providers/{ecpay,paypal,stripe}.ts` 與 `lib/db/schema.ts` 存在，但 app／lib／components 內沒有任何檔 import 它們（grep）；`lib/entitlements.ts:5-9` 自述為記憶體 stub。容器無任何金流或資料庫環境變數。
- 現有防護只有每來源每分鐘限流（`route.ts:104-106`）。
- 這一份 `lib/entitlements.ts`、`lib/payments/` 是 oracle 自己的，與 NA 的 `can()`／帳本無連接。
- repo 比線上新：main 已有「登記的網站用 Ed25519 簽章呼叫引擎」（commit `8d60735c2`；`lib/sites/registry.ts:4` 來源 = 環境變數 `ORACLE_SITES`；`lib/http/v1.ts:2` 驗章），線上容器沒有 `ORACLE_SITES`，且線上版本 `4adb301f3` 是否含這些 commit 未能查證（未比對 commit 祖先）。

**(c) 公開頁是誰產的**

- 全部由這個 Next.js 應用自己輸出：首頁與 12 個工具頁 `app/[lang]/{ziwei,bazi,hehun,iching,tarot,qian,astrology,vedic,fengshui,qimen,zeri,daily}`；sitemap `app/sitemap.ts:1-25`（語言 × `PAGE_SLUGS`，`lib/site.ts:16`）；`app/robots.ts`。
- 沒有文章／部落格路由（`app/[lang]` 下無 blog／article／post 目錄）；SEO 頁＝工具頁本身。首頁 `<title>`「東西方命理 — 紫微·八字·卜卦·塔羅」，無 WordPress generator 標記（curl）。

**(d) ks-aw-01 上的 WordPress 安裝：3 個容器＋1 個 staging 子目錄，都不是 multisite**

| 安裝 | 網域 | multisite |
|---|---|---|
| `lobster-wordpress` | aware-wave.com | 否（`wp core is-installed --network` 失敗；wp-config 無 `MULTISITE`） |
| `lobster-wordpress` 內 `/var/www/html/staging/e2e-verify-0704-6e2b91/` | aware-wave.com/staging/e2e-verify-0704-6e2b91 | 否（wp-config 無 `MULTISITE`） |
| `soulful-wp` | soulfulexpression.org | 否 |
| `mainwp-web` | mainwp.aware-wave.com（主機 nginx `sites-enabled/mainwp.aware-wave.com:7`） | 否（wp-config 無 `MULTISITE`；容器無 wp-cli，`--network` 未能執行） |

- oracle 的 WordPress 不存在：`docker ps` 無 `oracle-wp`／`oracle-db`。
- 計畫：`agency-os/handoffs/2026-11-20-oracle-skills-supervisor/briefs/WP-front-door-plan.md`（狀態「規劃」；操作者 2026-11-21 決定：網址放 WordPress、用該站自己的 WP 會員、付費先不做、站照客戶流程管理）。同目錄 `briefs/PLAN-REVIEW.md`（commit `bbe2f12af`，標題：兩份 oracle 計畫派卡前都要修訂；內文未讀）。
- 外掛原始碼已在 repo：`lobster-factory/packages/oracle-wp-plugin/`（commit `e082fbd04`；README：P1 = 設定頁、站台金鑰、iframe 嵌入；簽章「只建金鑰，尚未送請求」）；aware-wave.com `wp plugin list` 無此外掛；Soulful 未查。
- 該計畫的身分模型是「引擎只認網站、會員屬於各站自己的 WordPress」（計畫 §0、決定 4），與本報告 §2–§3 的「aware-wave.com 會員 → app 帳號」是兩套不同的對應方式。

## 未能查證

| 項 | 原因 |
|---|---|
| `soulful-expression`、`edd-research` 兩個組織是哪一支程式或手動建的 | `metadata.source` 空；未逐檔讀 0028/0029/0061 與當時 WORKLOG |
| `roles`／`user_role_assignments`／`workspace_memberships` 是否有客戶路徑在用 | 只確認表存在，未追呼叫點 |
| 註冊禮 Woo 商品、Nextend 的 Google 金鑰是否仍在 WP | 未查（避免碰到密鑰選項） |
| STORE 外掛的 PHP 測試目前是否綠 | 未跑 |
| Soulful 站有沒有裝 oracle 外掛；oracle 線上版本是否含站台簽章 commit | 未查 |
| ADR 017 `:198` 之後幾列（產品決定 #11、#12）的精確行號 | 以 `sed -n '198,238p'` 相對位置讀，未逐列標號 |
