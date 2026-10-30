# 2026-10-30 客戶自助註冊：email 與 Google 帳號（入口＝aware-wave.com WordPress）

Mode: 直接決策（非 /decide 面板）。**已定案（操作者 2026-10-30）並實作**，見下方「定案」；§4–§10 是定案前的草稿，與「定案」不同處以「定案」為準。

## 定案（操作者 2026-10-30「你全部處理好」）

| 待決 | 操作者答覆 | 實作 |
|---|---|---|
| 1 沒付錢能不能進 | 「如果註冊會員就送點數50點」 | WP 會員 email 驗證成功（或 Google gmail 註冊）→ 外掛建一張 0 元「註冊禮」訂單（`aware-wave-store/includes/WelcomeGift.php`）→ 走既有付款事件送 `credit_pack` 50 點＋5 個 `<product>_credits` 方案（見下「註冊禮範圍」）→ 控制面在這第一筆「付款」建帳號；訂單也讓「我的帳號」出現 studio 的「進入」。因此**不改 hand-off**：帳號在驗證那刻就建好，§4 的「第一次進入時建立」不需要 |
| 2 員工邀請過的客戶用同 email 在 WP 註冊 | 「我不想要被聯絡」→ 自動連結 | `lib/entitlements/wp-customers.ts` `adoptableClient`：只限 aware-wave.com；客戶帳號、root customer 組織、非 WP 建的組織、沒被任何會員持有 → 連結並確認 email |
| 3 portal 註冊 | 「好」刪除 | 刪 `app/portal/signup/`、`app/portal/api/signup/`、`products.ts` `selfSignup`；portal 登入頁改連 aware-wave.com/my-account/。DB 函式 `portal_complete_signup` 留著（service_role 限定、無人呼叫），下次動 0063 一併刪 |
| 4 Google 外掛 | 「好」Nextend 免費版 | `GoogleSignup.php`：gmail.com／googlemail.com 且 email 相同才算已驗證，其他照常寄驗證信 |
| 5 沒 user_kind 當員工 | 「修」 | prod 唯一一個（owner）先補 `user_kind=staff`；`middleware.ts` `resolveTenantFromMeta` 沒 kind → 403；`staff-accounts.ts` 只認 `staff` |

註冊禮範圍（操作者「全部處理好」＋要管理頁）：開 5 個已上線且有點數功能的產品。0145 每產品一個 `<product>_credits` 加購方案（登記表 billing=credits 的全部功能）；0146 一筆點數包可帶 `plan_keys`（1–20，舊 `plan_key` 照收）；外掛點數包商品的方案欄可填多個（空白隔開）。design 只有訂閱功能、cs／collect／outreach 門未開，不在內。方案之後在 `/ops/plans` 管（0147）。

上線狀態（2026-10-30 13:20）：next-admin `420233a4c` 推 main（03:00 自動部署）；0145–0147 已套正式庫；aware-wave-store v1.3.0 已裝 aware-wave.com（註冊禮商品 ID 未設＝不送、Woo 註冊仍關）。
**03:00 部署後才做**（外掛先於 0146 上線會靜默丟 `plan_keys`，README）：①確認 next-admin 跑 ≥`420233a4c`；②建 Woo 商品「註冊禮」：私人、0 元、虛擬、點數 50、方案 `content_credits social_credits studio_credits tarot_credits video_credits`、產品 studio，把 ID 填進「AwareWave 付款與會員 → 註冊禮商品」；③WooCommerce 開「我的帳號頁允許註冊」；④另一信箱實走 註冊→點驗證信→註冊禮訂單→「進入」studio（點數 50、5 產品權利列）。
**Google**：裝 Nextend Social Login（免費）；Client ID／Secret 由操作者在 Google Cloud Console 建（redirect 網址照 Nextend 設定頁顯示的填）後填入；**同 email 既有會員的自動連結要關**：攻擊者可先用受害者 email 建 WP 帳號（知道密碼），受害者用 Google 登入被連進該帳號後驗證信箱 → 雙方共用帳號。

I6 落地：aware-wave.com（`sellerKind=internal`）的會員帳號直接建成已驗證、不寄設定密碼信（`client-invite.ts` `verifiedClientAccount`）；轉售站照舊寄信。

前提（操作者 2026-10-30 定案）：註冊入口放 aware-wave.com。原話：「我之後想把產品放在aware-wave.com, 是wordpress, 因為我用使用外他的woo commerce, 會員和一些東西」。所以：WordPress／WooCommerce 會員是註冊與帳號的起點，email 驗證與 Google 登入都在 WP 端做；app 帳號在客人第一次從 WP 進產品時建立或連結，沿用 `wp-handoff` 與 4c-2 站點簽章登入；**不開第二個註冊入口**。

## 0. 結論

- 人的帳號＝WordPress 會員（真相來源：登入方式、email、是否已驗證）；能用什麼＝app 的權利列（真相來源：`organization_entitlements`）。app 的 GoTrue 帳號只是 WP 會員的「影子」，由 next-admin 依 WP 簽章的請求建立或連結。
- 第一次按「進入」：next-admin 依「站點簽章＋已驗證 email」當場建立或連結 app 帳號，直接登入，不再多寄一封設定密碼信。
- WP 端 email 未驗證 → 不建、不連、不登入（三道檢查，§4）。
- 只有我們自己的站（`sellerKind=internal`，即 aware-wave.com）的「已驗證」可以直接算數；轉售客戶的站照舊要點 app 寄的信（§3 I6）。
- 不用 GoTrue 內建 Google、不開 GoTrue 公開註冊；Google 只裝在 WP。

## 1. 現況（已讀，附出處）

| 事實 | 出處 |
|---|---|
| WP 端 email 驗證已有：註冊與改 email 時寄 48 小時一次性簽章連結；已驗證＝`aware_wave_email_verified` 等於目前 email | `packages/aware-wave-store-plugin/includes/EmailVerification.php:1-23`、`:29` |
| 買方案前要已驗證 email | `aware-wave-store-plugin/includes/CheckoutGate.php:1-8` |
| 「進入」按鈕只列會員**已付款訂單**裡的產品；送 `{wp_user_id, product_key, ts, nonce, key_id?}`，無 email | `aware-wave-store-plugin/includes/MyAccountDoors.php:1-8`、`:21-23`、`:79-85` |
| hand-off：驗站點簽章（aware-wave.com＝HMAC、轉售站＝Ed25519）、±60 秒、nonce 一次 → 找外部身分；**找不到就 404 `not_a_member`** → 檢查持有產品 → 帳號仍是該組織的 client → `email_confirmed_at` 必須有 → 回一次性 `recovery` 登入連結 | `next-admin/lib/auth/sources/awarewave-wp.ts:49-99`（`:78` 404、`:79` 持有、`:85-86` client、`:93` email） |
| 現在 app 帳號只在**第一次付款**建：要 `email_verified:true`；email 已屬員工或別的組織 → 拒絕 `email_taken`；同一人在別的站 → `email_taken_elsewhere`，永不合併（D5：一站一帳戶） | `next-admin/lib/entitlements/wp-customers.ts:119-157`（`:129` 未驗證拒、`:132-140` 衝突拒） |
| 付款建的帳號 `email_confirm:false`＋寄設定密碼信；第一次「進入」一定要先點這封信（critic 2026-10-25 High：WooCommerce 不驗 email，若不擋，用別人 email 註冊就能拿到那個 email 的 app 帳號並偽造 0103 證明） | `client-invite.ts:1-14`、`:141-148`；`awarewave-wp.ts:89-93` |
| 外部身分表 `customer_identities`：(provider, external_id) 唯一、(provider, user_id) 唯一 | `packages/db/migrations/0124_customer_identities.sql:8`、`:13-14` |
| 站點分我們自己的（internal）與轉售客戶的（customer） | `next-admin/lib/payments/sites.ts:16-22` |
| middleware 把沒有 `user_kind` 的帳號當員工 | `next-admin/middleware.ts:116` |
| GoTrue 公開註冊已關，必須保持（理由同上） | `lobster-factory/infra/supabase/docker-compose.yml:163-166` |
| portal 註冊鎖死（`SIGNUP_VERIFIES_EMAIL=false`），且自帶密碼、`email_confirm:true` | `next-admin/app/portal/api/signup/route.ts:9`、`:99`、`:196-201` |
| 客戶身分一律 enforce，沒權利列打不到付費功能 | `next-admin/lib/entitlements/can.ts:85-88` |
| ADR 018：portal 註冊在「公開門會員取代註冊」時決定去留；開放前要先驗 email | `018-product-doors-and-buyout-delivery.md:25`、`:79` |

## 2. 真相來源

| 資料 | 真相在 | app 端怎麼用 |
|---|---|---|
| 這個人是誰、怎麼登入（密碼／Google） | WP 會員 | app 不收密碼；唯一入口是 WP 簽章 hand-off（員工另走員工登入） |
| email 與「已驗證」 | WP（`aware_wave_email_verified`） | 每次 hand-off 由 WP 簽章帶來；app 只存副本 |
| WP 會員 ↔ app 帳號 對應 | app `customer_identities`（`(provider, external_id)` 唯一） | 第一次進入時寫；之後只用它找人，**不再用 email 找** |
| 身分種類 `user_kind`／`org_id` | app `app_metadata`，只由 next-admin 寫 | WP 永遠寫不到 |
| 買了什麼、能用什麼 | app `organization_entitlements`（WP 付款事件寫入） | `can()` |

app 的 GoTrue 帳號不設密碼，所以只有一條路能登進去，帳號不會分成兩份各自演變。現有付款建的帳號已經有密碼的照舊可用，不強制收回。

## 3. 不變量

- **I1 身分只由伺服器寫**：`user_kind`／`org_id` 只由 next-admin 寫進 `app_metadata`。
- **I2 沒被證明的 email 不算數**：WP 端未驗證 → 不建、不連、不登入、不能成為品牌成員。
- **I3 註冊 ≠ 開通**：WP 註冊只建會員；app 帳號建了也什麼都打不開，能用什麼只看權利列。
- **I4 GoTrue 公開註冊永遠關**：app 帳號只從 next-admin 建。
- **I5 一個 WP 會員最多對應一個 app 帳號，連好後不換**：之後 email 改了也照對應走，不重新用 email 配對。
- **I6 只信任我們自己站的「已驗證」**：只有 `sellerKind=internal` 的站可以讓 app 直接把 email 標成已驗證；轉售客戶的站不是我們管，它說「已驗證」就是它自己說的，照舊要點 app 寄的信。
- **I7（獨立項，建議一起修）沒有 `user_kind` 的帳號哪裡都進不去**：今天反過來預設員工（`middleware.ts:116`）。翻轉前要先在 prod 數一次沒有 `user_kind` 的帳號、補上（新建員工有寫，`lib/accounts/staff-accounts.ts:123`；舊的可能沒有）。

## 4. 第一次從 WP 進產品的流程

**WP 端（`aware-wave-store`）**
1. hand-off body 加 `email`、`email_verified`（`EmailVerification::isVerified`），一起簽章。
2. 未驗證的會員不送請求，顯示「請先驗證 email」與重寄按鈕（第一道檢查）。

**app 端（`wp-handoff` → `awarewave-wp.ts`）**，簽章、時間、nonce 檢查照舊：
1. 用 `(站點, wp_user_id)` 找 `customer_identities`。
2. **找到** → 照現有流程（持有產品 → 仍是該組織 client → 登入）。`email_confirmed_at` 檢查照舊。
3. **找不到**（第一次）：
   - `email_verified !== true` → 403 `email_unverified`（第二道檢查）。
   - 依 §5 合併規則決定「新建」「連結」或「拒絕」。
   - 新建：組織（沿用 `ensureWpOrganization`，slug 由 wp_user_id 推出，重試落到同一列）＋`createUser({email_confirm: 站點是 internal, app_metadata:{user_kind:"client", org_id}})`，不設密碼＋寫 `customer_identities`（最後寫，當作「完成」標記，同 `wp-customers.ts:1-7`）。
   - 轉售站（customer）：同上但 `email_confirm:false`，寄 app 的驗證信，回 403 `email_unverified`，點信後再按「進入」。
4. 持有產品檢查：沒有 → 403 `product_not_held`（帳號留著，日後買或被贈送就能進）。
5. 登入前最後確認 `email_confirmed_at`（第三道檢查，現有 `awarewave-wp.ts:93`）。

付款建帳號（`ensureWpCustomer`）改成呼叫同一支「建立或連結」函式，兩條路一份邏輯。付款路徑也改成依 I6 決定要不要寄設定密碼信。

**沒付錢的人能不能進？** 「進入」按鈕只列已付款訂單的產品（`MyAccountDoors.php:79-85`）。要給免費試用，最省的做法是在 WooCommerce 上架 0 元「試用方案」商品：走現有付款事件寫權利列，app 不用新寫程式（§8 待決 1）。

## 5. 同 email 重複帳號怎麼合併

找不到對應時，用 WP 帶來的（已驗證）email 查 app：

| app 裡已有這個 email 的帳號 | 動作 | 理由 |
|---|---|---|
| 沒有 | 新建（§4） | — |
| 同站同會員之前做到一半的（組織 slug 吻合） | 補完並連結 | 現有自我修復（`wp-customers.ts:134`） |
| 客戶帳號、email 已驗證、**還沒對應任何 WP 會員**（例：員工後台邀請的客戶） | **建議：連結到那個帳號**（只限 internal 站）。WP 驗證過、app 也驗證過同一個信箱＝同一個人。連結後 WP 買的東西記在那個帳號的組織 | 今天會拒絕 `email_taken`，被邀請的客戶永遠無法從 WP 進來（§8 待決 2） |
| 客戶帳號、email **未驗證**（邀請了但沒點信） | 只限 internal 站：標成已驗證並連結 | 未驗證帳號沒有密碼、沒人登得進去；WP 的驗證就是那份證明 |
| 客戶帳號、已對應**同站另一個** WP 會員 | 拒絕 `email_taken` | I5：一個 app 帳號只對應一個會員，避免改 email 搶帳號 |
| 客戶帳號、已對應**別的站**的會員 | 拒絕 `email_taken_elsewhere` | D5 不變（`wp-customers.ts:136-139`） |
| 員工帳號 | 拒絕，WP 顯示「此 email 是員工帳號，請改用其他 email 或聯絡我們」 | 員工帳號不能變成客戶登入口 |
| 轉售站（customer）的任何「連結」情況 | 拒絕連結；只能新建（email 必須沒人用） | I6 |

已連結後：WP 會員改 email → WP 重新驗證；app 只把 GoTrue email 同步成新的、已驗證的地址（下次 hand-off 時），對應不變。

## 6. Google 登入

- 只在 WP：外掛（例：Nextend Social Login）提供「用 Google 註冊／登入」。
- 要加一小段 PHP（`aware-wave-store`）：外掛建立或登入會員時，**只在 Google 回報 email 已驗證**且等於會員目前 email，才寫 `aware_wave_email_verified`；否則照常寄 WP 驗證信。
- 同 email 的 WP 會員已存在 → 交給外掛的連結設定，建議設成「同 email 自動連到現有會員」（Google 已證明是信箱主人）。這只影響 WP 內部，不影響 app 對應（app 只認 wp_user_id）。
- app 端完全不碰 Google、不碰 GoTrue 設定。

## 7. 防濫用

- WP 註冊頁：Turnstile 或同級驗證碼（外掛或 WooCommerce 設定；app 現有 `lib/turnstile.ts` 只管 app 自己的表單）。
- WP 驗證信重寄：每會員每小時 1 封（防拿我們的網域寄垃圾，DMARC 正在升級）。
- app 端：hand-off 本來就要站點簽章＋nonce＋±60 秒；新建帳號只發生在「已驗證 email＋站點簽章」之後，不需要另加限流。
- 錢：客戶一律 enforce（`can.ts:87-88`）；沒權利列的帳號打不到付費 vendor。
- 試用：若用 0 元試用商品，試用的到期日跟著 ADR 017 的 trial 規則（`017-...md:76`：14 天、每產品一次）。這條規則是否已實作，本次未查。

## 8. 需要操作者決定

1. **沒付錢的人能不能進產品？** 能 → 上架 0 元試用商品（給什麼：14 天全功能／贈 N 點／只開某產品）。不能 → 註冊後要先買。
2. **員工邀請過的客戶，之後在 aware-wave.com 用同一個 email 註冊**：連結到原本帳號（建議，WP 買的東西記在原組織）？還是拒絕、請他找我們？
3. **portal 註冊程式去留**：建議刪除 `app/portal/signup`、`app/portal/api/signup`、`0063 portal_complete_signup`（down 腳本已有）。它是第二個註冊入口，又帶著未驗證 email 的缺口；新流程完全不需要它。
4. **WP Google 外掛**：免費版（例：Nextend Social Login）可以嗎？
5. **I7（沒有 `user_kind` 就拒絕）**：員工登入相關（High），要你 go。

## 9. 方案與 rollback

| | **A 建議** | B 不建議（留作比較） |
|---|---|---|
| 內容 | §4–§6：WP 驗證＋Google 外掛、hand-off 帶 email 並「建立或連結」、付款路徑共用同一支函式；portal 註冊刪除 | 另開 app 自己的註冊頁與 Google 登入（GoTrue 或 next-admin） |
| 改動 | `aware-wave-store`：hand-off body、未驗證提示、Google 旗標 PHP（發新版）；next-admin：`awarewave-wp.ts`、`wp-customers.ts` 共用建立／連結、測試；刪 portal 註冊 | 第二套註冊、第二套 email 驗證、帳號真相來源變兩邊 |
| 風險 | High（身分、登入流程；要你 go，critic＋Codex 審） | 更高，且違反「不開第二個入口」 |
| rollback | ①WP：取消勾選「允許註冊」、停用 Google 外掛 ②app：revert `awarewave-wp.ts` 那個 commit → 找不到對應時回到現在的 404 `not_a_member`，已建的帳號與對應保留、可再登入 ③外掛舊版 body 不帶 email 時，新 app 視同未驗證、走舊流程（新舊相容，可分開發版） | — |

## 10. 下一步（拍板後）

- 由 `planner` 拆卡（WP 外掛、next-admin、刪 portal 三塊）。建議模型：Fable 5.1 產卡、Opus 5.5 實作。
- 驗收：用另一個信箱在 aware-wave.com 實走 ①email 註冊 → 點驗證信 → 進入（建帳號）②Google 註冊 → 進入 ③未驗證 → 進入被擋 ④員工邀請過的 email → 依待決 2 結果。
