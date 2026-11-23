# ADR 021: 會員模型 — 每個客戶單位連到一個收銀台網站會員；單位底下的人是被授權的 app 帳號；分類由合約算出

- **狀態**：已接受（操作者 2026-11-21：D1–D3 原話見 §1；Q1–Q4「都照建議」）。2026-11-21 依獨立審查 B1–B6、m4、m5、m10 改文（`agency-os/handoffs/2026-11-22-platform-membership-ux/PLAN-REVIEW-20261121.md`）；2026-11-22 操作者改定 D1 範圍。三層身分已定。**尚未實作**：缺口見 §3。
- **日期**：2026-11-21
- **承接**：[ADR 015](015-awarewave-account-and-shared-wallet.md) §2、[ADR 017](017-entitlements-and-self-hosted-modules.md) §0（三軸）／§0b 第 5、6 條、[ADR 018](018-product-doors-and-buyout-delivery.md) §3。本 ADR 只補「單位／人／分類／代辦」。
- **現況證據**：`agency-os/handoffs/2026-11-22-platform-membership-ux/WP-MEMBERSHIP-STATUS-20261121.md`（下稱「現況報告」）。
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`

## 1. 決定

| # | 決定 | 來源 |
|---|---|---|
| D1 | 跟我們買的每個單位（根組織）都是 aware-wave.com 會員，可由我們代辦，含經銷商本身、買斷的買家、測試用客戶。經銷商的客戶、買斷買家的客戶是**他們自己網站的會員，與我們無關**。AwareWave Ops 不是客戶，是 Admin。子組織（`parent_organization_id` 非空）隨根組織，不另開會員。 | 操作者 2026-11-21：「所有客戶(單位)要成為aware-wave.com會員 我才能統一操作, 我們可以代為申請」；2026-11-22：「AwareWave Ops >> Admin」「經銷商的客戶、買斷的客戶 >> 我們的會員，他的客戶是他的會員(跟我們無關)」 |
| D2 | 單位底下的人＝被授權的 app 帳號，不是收銀台網站會員；登入來源照該產品 `loginSources`（ADR 018 §3）。 | 操作者：「客戶開放授權…那些人不會是aware-wave.com會員」；`NA/lib/portal/products.ts:43-49` |
| D3 | 會員身分＝三層（§2）：角色（Admin／客戶／TEST）、方式（訂閱／代操／買斷／點數／經銷）、產品（照產品登記表）。方式×產品記在 app 合約；WordPress 端由系統自動貼「產品／方式」成對標籤＋方式標籤，不手改。 | 操作者 2026-11-22：「申請會員一定要填 role」「第二層: 訂閱/代操/買斷/點數/經銷；第三層: 影片…」；角色三個與成對標籤「對」 |
| D4 | 代辦：員工在客戶頁對**指定的既有組織**發起，會員用單位聯絡人的 email，對方在收銀台網站驗證 email 後才連上；不靠 email 比對找組織，不用我方信箱代持。 | Q1；審查 B4 |
| D5 | 單位的管理者＝持有該單位會員連結的那個 app 帳號（`customer_identities.user_id`），只存這一處，不另設 owner 欄位。管理者與員工都能授權單位底下的人。換管理者＝「轉移會員」流程。 | Q2；審查 B3 |
| D6 | 先只賣點數；訂閱外掛等第一個要訂閱的客戶。 | Q4；ADR 015 §1 |

## 2. 模型

- **主檔在 app**（Supabase `organizations`）。收銀台網站（今天是 WordPress）是註冊與付款的門口，不是主檔（ADR 017 §0b 第 6 條）。單位與會員的連結＝`customer_identities` 一列（鍵 `(site_id, external_id)`）；不變量：一會員一組織（`wp-customers.ts:7`）。
- **連結的兩個寫入路徑**：收銀台網站的簽章事件（現有，付款時）；員工代辦（D4，未做）。兩者都只寫 `customer_identities`。
- **人**：`organization_memberships`＋各產品角色（`NA/lib/accounts/client-invite.ts:1-9`）。
- **三層身分**（每層一個問題、一個來源）：

  | 層 | 回答 | 值 | 來源（唯一寫入方） | WordPress 端 |
  |---|---|---|---|---|
  | 1 角色 | 他是誰 | Admin／客戶／TEST | app `organizations.kind`（internal／customer／test；`test` 已加（M1，0175）） | WordPress 角色，建會員時由 kind 帶入；自己註冊＝客戶。除 Admin 外權限同 WooCommerce `customer` |
  | 2 方式 | 怎麼跟我們合作 | 訂閱／代操／買斷／點數／經銷／贈送 | 由資料算出（`NA/lib/entitlements/member-tags.ts`）：訂閱＝有效訂閱列或有效 contract 來源權利列；代操＝`organization_product_operations`；經銷＝有效 `<產品>.resell` 權利列；點數＝餘額大於 0 或該產品走扣點；贈送＝有效 comp 來源權利列（2026-11-23 操作者交監工決定）；買斷未做（U35） | 標籤 |
  | 3 產品 | 用在哪個產品 | `NA/lib/portal/products.ts` 的產品 key（新增產品自動多一個） | 同上 | 標籤 |

  標籤由單一函式（放 `NA/lib/entitlements/`）算出，經 `crm` 接頭單向寫入（ADR 017 §0b 第 5 條 `crm: fluentcrm | none`）：每筆合約一張成對標籤「產品／方式」，另每種方式一張方式標籤。收銀台端不改。角色只表身分，不表方式或產品（同一單位可同時「影片／買斷」「內容行銷／訂閱」）。
  例：Soulful＝客戶；內容行銷／代操、內容行銷／訂閱。經銷商＝客戶；影片／經銷。
- 結帳必登入（訪客付款無法歸戶）。

## 3. 缺口（未實作）

| # | 缺口 | 證據 |
|---|---|---|
| G1 | 代辦路徑不存在：連結只在付款事件建立；email 不符時會新建 `wp-member-<id>` 重複單位 | `wp-customers.ts:169,177-190` |
| G2 | 現有 active 客戶組織無會員連結（僅 2 個測試列，且與 WP id 對不上） | 現況報告 §3、§7 |
| G3 | **部分已關（M2，0178，2026-11-23）：代操可記在 `organization_product_operations`**；仍缺：標籤函式與 `crm` 接頭設定不存在；WordPress 端沒有 TEST 角色（現有 7 個皆內建，`customer` 即「客戶」）；合約沒有「代操」「經銷」兩種方式的記法 | 現況報告 §8 |
| G4 | 客戶自己授權他人：只有員工能邀請；產品層只有 social 有成員頁 | `NA/app/api/ops/clients/[slug]/accounts/route.ts:100`；`NA/app/(shell)/tools/social/Members.tsx` |
| G5 | 轉移會員（換管理者／聯絡人離職）無路徑：`linkIdentity` 三欄不同即 `identity_conflict` | 現況報告 `:68` |
| G6 | 訪客結帳開著，程式假設結帳必登入 | 現況報告「矛盾」第 4 項 |
| G7 | 登入頁叫客戶去 aware-wave.com 註冊，但該處關著且無進入鈕 | 現況報告「矛盾」第 1 項 |
| G8 | 四個開關關著（NA 密鑰空、`seller_sites` disabled、店外掛停用、WP 密鑰已刪） | 現況報告 §2 |
| G9 | 「全部換成 local 設定跑整套測試」不存在 | 現況報告 §8 |
| G10 | 收銀台端刪除會員／改 email → app 沒有對應事件 | 現況報告 `:188` |
| G11 | **已關（M11，2026-11-23）**。原：aware-wave.com 進門不看產品 `loginSources`；現 wp-handoff 與 wp-summary 都經 `opensTo` 查清單 | `NA/lib/auth/sources/awarewave-wp.ts` `opensTo` |
| G12 | **已關（M1，0175，2026-11-22 已套用）**。原：測試單位沒有標記：`e2e-verify-0704-5c1356`、`test-wp-webhook-co-c705c6` 都是 `kind=customer`；`kind` 需加值 `test` | 正式庫 `organizations` SELECT 2026-11-22（`kind` 只有 `customer`／`internal`） |
| G13 | WordPress「我的帳號」的「進入」清單來自該會員的 WooCommerce 訂單，不是 app 權益：贈送、員工建立的合約、代操客戶持有的產品不會出現 | `lobster-factory/packages/aware-wave-store-plugin/includes/MyAccountDoors.php:109-121` |

開放註冊的前置條件：G1、G5、G6、G7、G10 完成，且以一個測試會員走完「註冊 → 付款 → 進產品 → 扣點」。畫面位置由 ADR 020（目前客戶）的客戶頁決定；缺口卡排在該計畫 K10 之後。

## 4. 沒選的做法

- 單位底下的人也當收銀台會員：需團隊外掛；與 D2 相反。
- 代操客戶不當會員：操作者無法在 WordPress 統一操作；與 D1 相反。
- WordPress 當主檔、app 當副本：與 ADR 017 §0b 第 6 條相反（換收銀台就要搬主檔）。
- 分類存成手填欄位：與合約重複，會不一致。
- 用角色表示方式或產品（代操客戶／買斷客戶／經銷商各一個角色）：一個會員一個角色，放不下「影片買斷＋內容行銷訂閱」。
- aware-wave.com 加裝 Ultimate Member、WooCommerce Memberships：前者與 WooCommerce「我的帳號」重疊；後者與 app 的權利判定重複。等出現會員才能看的內容或自助申請審核流程再評估。
- 另設組織層 owner 欄位：與 `customer_identities.user_id` 兩處記同一事實。
- 用我方信箱代持客戶會員：帳號實際歸我方，違反「帳號只給已證明的 email」（`client-invite.ts:1-4`）。

## 5. 待操作者確認

無（Q1–Q7 已定：Q5 代操＝合約上的一種方式；Q6 AwareWave Ops＝Admin；Q7 測試標記＝`kind=test`→角色 TEST）。

## 6. 需更正的既有文件（實作時一併）

- ADR 015 `:3`「尚未實作」、§2 簽章寫 Ed25519（aware-wave.com 實作為 HMAC）、`selfSignup` 等過時文字：現況報告「矛盾」。
