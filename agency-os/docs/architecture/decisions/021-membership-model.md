# ADR 021: 會員模型 — 每個客戶單位連到一個收銀台網站會員；單位底下的人是被授權的 app 帳號；分類由合約算出

- **狀態**：已接受（操作者 2026-11-21：D1–D3 原話見 §1；Q1–Q4「都照建議」）。2026-11-21 依獨立審查 B1–B6、m4、m5、m10 改文（`agency-os/handoffs/2026-11-16-video-unify-supervisor/PLAN-REVIEW-20261121.md`）；§5 兩題待操作者確認。**尚未實作**：缺口 G1–G11。
- **日期**：2026-11-21
- **承接**：[ADR 015](015-awarewave-account-and-shared-wallet.md) §2、[ADR 017](017-entitlements-and-self-hosted-modules.md) §0（三軸）／§0b 第 5、6 條、[ADR 018](018-product-doors-and-buyout-delivery.md) §3。本 ADR 只補「單位／人／分類／代辦」。
- **現況證據**：`agency-os/handoffs/2026-11-16-video-unify-supervisor/WP-MEMBERSHIP-STATUS-20261121.md`（下稱「現況報告」）。
- NA = `lobster-factory/infra/hetzner-phase1-core/apps/next-admin/`

## 1. 決定

| # | 決定 | 來源 |
|---|---|---|
| D1 | 我們 hosted 安裝裡，每個 `kind=customer` 的根組織（＝單位，含代操客戶）都連到一個收銀台網站會員：AwareWave 直售的在 aware-wave.com；經銷商的客戶在該經銷商站。可由我們代辦。**不含**：內部組織（`kind=internal`，自用）、測試組織、子組織（`parent_organization_id` 非空，隨根組織）。買斷安裝內的單位照該安裝的登入來源（ADR 018 §3）。 | 操作者：「所有客戶(單位)要成為aware-wave.com會員 我才能統一操作, 我們可以代為申請」；範圍依 `NA/lib/entitlements/wp-customers.ts:45,56`（只收 `kind=customer` 根組織） |
| D2 | 單位底下的人＝被授權的 app 帳號，不是收銀台網站會員；登入來源照該產品 `loginSources`（ADR 018 §3）。 | 操作者：「客戶開放授權…那些人不會是aware-wave.com會員」；`NA/lib/portal/products.ts:43-49` |
| D3 | 會員要分類；分類不手填，由合約（ADR 017 B 軸）用 §2 的判定表算出，一個單位可多類。 | 操作者：「會員要分類」 |
| D4 | 代辦：員工在客戶頁對**指定的既有組織**發起，會員用單位聯絡人的 email，對方在收銀台網站驗證 email 後才連上；不靠 email 比對找組織，不用我方信箱代持。 | Q1；審查 B4 |
| D5 | 單位的管理者＝持有該單位會員連結的那個 app 帳號（`customer_identities.user_id`），只存這一處，不另設 owner 欄位。管理者與員工都能授權單位底下的人。換管理者＝「轉移會員」流程。 | Q2；審查 B3 |
| D6 | 先只賣點數；訂閱外掛等第一個要訂閱的客戶。 | Q4；ADR 015 §1 |

## 2. 模型

- **主檔在 app**（Supabase `organizations`）。收銀台網站（今天是 WordPress）是註冊與付款的門口，不是主檔（ADR 017 §0b 第 6 條）。單位與會員的連結＝`customer_identities` 一列（鍵 `(site_id, external_id)`）；不變量：一會員一組織（`wp-customers.ts:7`）。
- **連結的兩個寫入路徑**：收銀台網站的簽章事件（現有，付款時）；員工代辦（D4，未做）。兩者都只寫 `customer_identities`。
- **人**：`organization_memberships`＋各產品角色（`NA/lib/accounts/client-invite.ts:1-9`）。
- **分類判定**（單一函式，放 `NA/lib/entitlements/`；經 `crm` 接頭單向寫成收銀台網站的 CRM 標籤，ADR 017 §0b 第 5 條 `crm: fluentcrm | none`；收銀台端不改分類）：

  | 標籤 | 判定 |
  |---|---|
  | 訂閱 | 有生效中的 `contract` 合約列 |
  | 點數 | 錢包有點數購買紀錄（`credits`） |
  | 買斷 | 有 `perpetual` |
  | 贈送 | 只有 `comp` |
  | 代操 | 待定（§5 Q5） |

  「自用」不是會員分類：自用＝內部組織，不在 D1 範圍；「代操／自用」在 ADR 017 是每次操作的屬性（`actor`／`on_behalf_of`，`:30`），不是單位屬性。
- 結帳必登入（訪客付款無法歸戶）。

## 3. 缺口（未實作）

| # | 缺口 | 證據 |
|---|---|---|
| G1 | 代辦路徑不存在：連結只在付款事件建立；email 不符時會新建 `wp-member-<id>` 重複單位 | `wp-customers.ts:169,177-190` |
| G2 | 現有 active 客戶組織無會員連結（僅 2 個測試列，且與 WP id 對不上） | 現況報告 §3、§7 |
| G3 | 分類判定函式與 `crm` 接頭設定不存在 | 現況報告 §8 |
| G4 | 客戶自己授權他人：只有員工能邀請；產品層只有 social 有成員頁 | `NA/app/api/ops/clients/[slug]/accounts/route.ts:100`；`NA/app/(shell)/tools/social/Members.tsx` |
| G5 | 轉移會員（換管理者／聯絡人離職）無路徑：`linkIdentity` 三欄不同即 `identity_conflict` | 現況報告 `:68` |
| G6 | 訪客結帳開著，程式假設結帳必登入 | 現況報告「矛盾」第 4 項 |
| G7 | 登入頁叫客戶去 aware-wave.com 註冊，但該處關著且無進入鈕 | 現況報告「矛盾」第 1 項 |
| G8 | 四個開關關著（NA 密鑰空、`seller_sites` disabled、店外掛停用、WP 密鑰已刪） | 現況報告 §2 |
| G9 | 「全部換成 local 設定跑整套測試」不存在 | 現況報告 §8 |
| G10 | 收銀台端刪除會員／改 email → app 沒有對應事件 | 現況報告 `:188` |
| G11 | aware-wave.com 進門不看產品 `loginSources` | `NA/lib/auth/sources/awarewave-wp.ts:75-80` |

開放註冊的前置條件：G1、G5、G6、G7、G10 完成，且以一個測試會員走完「註冊 → 付款 → 進產品 → 扣點」。畫面位置由 ADR 020（目前客戶）的客戶頁決定；缺口卡排在該計畫 C10 之後。

## 4. 沒選的做法

- 單位底下的人也當收銀台會員：需團隊外掛；與 D2 相反。
- 代操客戶不當會員：操作者無法在 WordPress 統一操作；與 D1 相反。
- WordPress 當主檔、app 當副本：與 ADR 017 §0b 第 6 條相反（換收銀台就要搬主檔）。
- 分類存成手填欄位：與合約重複，會不一致。
- 另設組織層 owner 欄位：與 `customer_identities.user_id` 兩處記同一事實。
- 用我方信箱代持客戶會員：帳號實際歸我方，違反「帳號只給已證明的 email」（`client-invite.ts:1-4`）。

## 5. 待操作者確認

| # | 問題 | 建議 |
|---|---|---|
| Q5 | 「代操」這個分類怎麼判定？ | 把代操當成一個登記在方案表的服務（一列合約），有這列就是代操。不新增欄位，判定與其他分類同一來源。 |
| Q6 | 我們自己（AwareWave Ops）要不要也在 aware-wave.com 有一個會員？ | 不要。它是內部組織，不是客戶；要在 WordPress 看到它，用員工帳號即可。 |

## 6. 需更正的既有文件（實作時一併）

- ADR 015 `:3`「尚未實作」、§2 簽章寫 Ed25519（aware-wave.com 實作為 HMAC）、`selfSignup` 等過時文字：現況報告「矛盾」。
